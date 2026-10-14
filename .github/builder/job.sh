#!/usr/bin/env bash
# Steps of the builder workflow (.github/workflows/builder.yml) on a GitHub-hosted ubuntu-24.04
# runner. The workflow runs them as the "runner" user, which has passwordless sudo:
#
#   prepare      tooling, the "builder" user, its network filter and its own clone of this repository
#   checks       review only: npm ci, npm test and npm run build of the commit under review, as "builder" in a
#                sandbox and without any token; then every process of "builder" stops, its home is wiped and the
#                clone is made again, so no code of the project is left to run during the review session
#   session      GitHub OIDC token -> router session
#   agent        the AI builder session, as "builder" in a sandbox
#   end-session  closes the router session and stops "builder", whatever happened to the agent
#   push         takes the builder's commits as a git bundle, checks them, pushes them to main
#   build        npm ci and npm run build as "builder" in a sandbox, output copied to out/app
#   summary      the session summary, with the runner's values on top (task, commits, plan, blocked network), in
#                out/summary.json
#
# Security model. The AI agent can run any code, so nothing it controls ever runs as "runner":
# - The agent, and everything it wrote (package.json scripts included), runs as "builder" (no
#   sudo) in a systemd sandbox: read-only system (on hosted runners /opt, /usr/share and
#   /usr/local/bin are world-writable, and the runner runs programs from there), private /tmp,
#   no /home, no new privileges, no system D-Bus, an environment built from scratch (no GitHub
#   token, no ACTIONS_* variables, git without credentials). When a phase ends, systemd stops
#   all of its processes. cli.ts refuses to run the agent as root or as its parent's user.
# - Network: an allowlist, not a proxy (egress.ts). "builder" reaches only the npm registry, GitHub and the router
#   (its exact name; port 443 or the router's). nftables rules for its uid let out only the addresses that its own
#   resolver (egress.ts serve, root, on 127.0.0.2, the only nameserver the sandbox sees) answered for those names;
#   every other name gets NXDOMAIN and never leaves the machine, every other connection (other resolvers, metadata
#   services, addresses typed in code) is rejected. The summary reports every blocked name and address; the platform
#   logs them and sends them on Telegram. Loopback stays open (dev servers, tests). No filter, no builder phase.
# - No process of "builder" outside the sandbox: no D-Bus (so no "loginctl enable-linger"), no
#   login (its shell is nologin, so sshd runs nothing) and no systemd user manager
#   (user@<uid>.service is masked). After every phase of "builder" the runner checks that it did
#   not linger and that nothing changed in the directories of the job's PATH, where the runner
#   looks programs up (git, in the post step of actions/checkout). If something did, the
#   checkout is deleted (that post step then runs nothing) and the job fails.
# - The runner never looks a program up where "builder" could write: the steps run
#   /usr/bin/bash, this file resets PATH, and every root command has an absolute path (sudo looks
#   commands up in its secure_path, which starts with /usr/local/sbin:/usr/local/bin).
# - The tooling (cli.ts, session.ts, this file, npm packages, node) is installed before the
#   agent starts, in a root-owned directory the agent can read but not write. Every later step
#   uses only that copy.
# - Files cross over only as a git bundle and a tar stream, read as "builder" (never as root:
#   "builder" may have replaced them with links). The runner never runs git or a build inside a
#   directory "builder" can write.
# - The push uses the job's GITHUB_TOKEN, given only to that git command, after every process
#   of "builder" has stopped.
# - The outcome of the session (milestone done, plan done, review verdict) goes from cli.ts to the router,
#   signed with a key that cli.ts reads from the session file and deletes before the agent starts. The
#   platform never reads it from summary.json, which the project's build scripts can rewrite. A review
#   session never runs the project's code: the checks phase does, before the session exists.
#
# Time. After the agent the job keeps AFTER_AGENT_MINUTES for the push, the build and the
# uploads. A session lasts at most MAX_SESSION_MINUTES (the platform never asks for more) and
# never longer than the job allows: a longer one is shortened, with a warning.
set -euo pipefail

TOOLS=${TOOLS:-/var/lib/builder-tools}
BUILDER=${BUILDER_USER:-builder}
BHOME=${BUILDER_HOME:-/var/lib/builder}
NODE="$TOOLS/node/bin/node"
UNITS=(builder-clone builder-checks builder-agent builder-export builder-build)
JOB_MINUTES=130        # timeout-minutes of the job in builder.yml
SETUP_MINUTES=2        # checkout and setup-node, before prepare starts
AGENT_GRACE_MINUTES=5  # after the session minutes, while the agent stops (cli.ts: interrupt, then 3 minutes)
AFTER_AGENT_MINUTES=30 # end-session, push (export: 5), build (20), uploads and margin
MAX_SESSION_MINUTES=90 # JOB - SETUP - 3 (prepare, session) - AGENT_GRACE - AFTER_AGENT
EXPORT_SECONDS=300
BUILD_SECONDS=1200
CHECKS_SECONDS=1860    # npm ci (600) + npm test (600) + npm run build (600) + margin
MAX_CHECKS_BYTES=65536
LINGER_DIR=/var/lib/systemd/linger
MAX_BUNDLE_BYTES=$((200 * 1024 * 1024))
MAX_APP_BYTES=$((100 * 1024 * 1024))
MAX_SUMMARY_BYTES=65536
EGRESS_DIR=/run/builder-egress # root-owned: the nftables rules, the sandbox's resolv.conf, the blocked names
EGRESS_UNIT=builder-egress
EGRESS_TABLE=builder_egress
EGRESS_RESOLVER=127.0.0.2

die() {
  echo "::error::$*" >&2
  exit 1
}

# Root commands: always an absolute path, never a lookup in sudo's secure_path.
as_root() {
  [[ "$1" == /* ]] || die "root commands need an absolute path, not $1"
  /usr/bin/sudo -- "$@"
}

# Paths of the runner side (the sandbox phases do not have them).
runner_env() {
  PRIV="${RUNNER_TEMP:?}/builder-private"
  REPO="${GITHUB_WORKSPACE:?}/repo"
  OUT="$GITHUB_WORKSPACE/out"
  export TMPDIR="$PRIV/tmp"
}

# An input of the dispatch, as text ("" if missing).
dispatch_input() {
  jq -r --arg name "$1" '.inputs[$name] // "" | tostring' "${GITHUB_EVENT_PATH:?}"
}

session_kind() {
  local kind
  kind=$(dispatch_input kind)
  case "$kind" in
    opening | work | review) printf '%s\n' "$kind" ;;
    *) die "invalid session kind" ;;
  esac
}

# The task of the session, checked: KIND, SESSION (its ID: the platform finds the run by it), MILESTONE (0 for
# the opening, 1-999 otherwise) and FOLLOWUP (fix only for work, final only for review).
session_task() {
  KIND=$(session_kind)
  SESSION=$(dispatch_input session)
  MILESTONE=$(dispatch_input milestone)
  FOLLOWUP=$(dispatch_input followup)
  [[ "$SESSION" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || die "invalid session ID"
  [[ "$MILESTONE" =~ ^(0|[1-9][0-9]{0,2})$ ]] || die "invalid milestone"
  if [[ "$KIND" == opening ]]; then
    [[ "$MILESTONE" == 0 ]] || die "the opening has milestone 0"
  else
    [[ "$MILESTONE" != 0 ]] || die "milestone 0 is only for the opening"
  fi
  case "$FOLLOWUP:$KIND" in
    none:* | fix:work | final:review) ;;
    *) die "invalid followup for a $KIND session" ;;
  esac
}

# as_builder UNIT MAX_SECONDS [NAME=VALUE...] -- COMMAND [ARGS...]
# Runs COMMAND as "builder" in the sandbox, with only the listed environment variables.
as_builder() {
  local unit=$1 max=$2
  shift 2
  local -a env=(-E "HOME=$BHOME" -E "PATH=$TOOLS/node/bin:/usr/local/bin:/usr/bin:/bin" -E LANG=C.UTF-8
    -E SHELL=/usr/bin/bash -E "TOOLS=$TOOLS" -E "BUILDER_USER=$BUILDER" -E "BUILDER_HOME=$BHOME")
  while [[ $# -gt 0 && $1 != -- ]]; do
    env+=(-E "$1")
    shift
  done
  shift
  # Never without the network filter. The sandbox sees only its resolver: /etc/resolv.conf (and the file it links to)
  # names 127.0.0.2, and the sockets of systemd-resolved and nscd are hidden (they would resolve any name).
  local resolv
  /usr/bin/systemctl is-active --quiet "$EGRESS_UNIT.service" && as_root /usr/sbin/nft list chain inet "$EGRESS_TABLE" builder >/dev/null &&
    [[ -f "$EGRESS_DIR/resolv.conf" ]] || die "the network filter of $BUILDER is not active"
  resolv=$(readlink -e /etc/resolv.conf) || die "/etc/resolv.conf is missing"
  as_root /usr/bin/systemd-run --quiet --pipe --wait --collect --service-type=exec --expand-environment=no \
    --unit="$unit" --uid="$BUILDER" --gid="$BUILDER" --working-directory="$TOOLS" \
    -p RuntimeMaxSec="$max" -p NoNewPrivileges=yes -p RestrictSUIDSGID=yes \
    -p ProtectSystem=strict -p ReadWritePaths="$BHOME" -p ProtectHome=yes -p PrivateTmp=yes \
    -p PrivateDevices=yes -p ProtectKernelTunables=yes -p ProtectKernelModules=yes -p ProtectControlGroups=yes \
    -p InaccessiblePaths=-/run/dbus -p BindReadOnlyPaths="$EGRESS_DIR/resolv.conf:$resolv" \
    -p InaccessiblePaths=-/run/systemd/resolve/io.systemd.Resolve -p InaccessiblePaths=-/run/systemd/resolve/io.systemd.Resolve.Monitor \
    -p InaccessiblePaths=-/run/nscd \
    "${env[@]}" -- "$@"
}

# The network of "builder" (AUDIT.md F-04; egress.ts): nftables rules for its uid, then its resolver as a root unit
# (until the job ends; restarted if it stops), then a check that it answers. Any failure stops the job: no builder
# phase runs without the filter (as_builder checks it every time).
egress_on() {
  local uid=$1
  if [[ ! -x /usr/sbin/nft ]]; then
    as_root /usr/bin/apt-get install -y -qq --no-install-recommends nftables >/dev/null || die "nftables is not available"
  fi
  as_root /usr/bin/rm -rf "$EGRESS_DIR"
  as_root /usr/bin/install -d -o root -g root -m 755 "$EGRESS_DIR"
  (cd "$TOOLS" && "$NODE" --import tsx egress.ts rules "$uid" "$ROUTER_URL") >"$PRIV/egress.nft" || die "no network rules for $BUILDER"
  printf 'nameserver %s\noptions edns0 trust-ad\n' "$EGRESS_RESOLVER" >"$PRIV/resolv.conf"
  as_root /usr/bin/install -o root -g root -m 644 "$PRIV/egress.nft" "$EGRESS_DIR/rules.nft"
  as_root /usr/bin/install -o root -g root -m 644 "$PRIV/resolv.conf" "$EGRESS_DIR/resolv.conf"
  # From a file: nft 1.0.9 does not read rules from a pipe.
  as_root /usr/sbin/nft -f "$EGRESS_DIR/rules.nft" || die "the network rules of $BUILDER could not be applied"
  as_root /usr/bin/systemd-run --quiet --collect --unit="$EGRESS_UNIT" --service-type=exec --expand-environment=no \
    --working-directory="$TOOLS" -p Restart=on-failure -p RestartSec=1 \
    -p NoNewPrivileges=yes -p CapabilityBoundingSet="CAP_NET_ADMIN CAP_NET_BIND_SERVICE" \
    -p ProtectSystem=strict -p ReadWritePaths="$EGRESS_DIR" -p ProtectHome=yes -p PrivateTmp=yes -p PrivateDevices=yes \
    -p RestrictAddressFamilies="AF_INET AF_INET6 AF_NETLINK AF_UNIX" -E "EGRESS_DIR=$EGRESS_DIR" -E LANG=C.UTF-8 \
    -- "$NODE" --import tsx "$TOOLS/egress.ts" serve "$ROUTER_URL" || die "the resolver of $BUILDER did not start"
  (cd "$TOOLS" && "$NODE" --import tsx egress.ts check "$ROUTER_URL") || die "the resolver of $BUILDER does not work"
  echo "Network of $BUILDER: only the npm registry, GitHub and the router"
}

# What the network filter blocked, as JSON on stdout (egress.ts report), and readable in the log and the step summary.
# Names are printed as egress.ts wrote them: letters, digits, "-", "_", "." and "?" only.
egress_report() {
  local sets report
  sets=$(as_root /usr/sbin/nft -j list table inet "$EGRESS_TABLE" 2>/dev/null) || sets='{}'
  report=$(cd "$TOOLS" && "$NODE" --import tsx egress.ts report "$EGRESS_DIR/blocked.json" <<<"$sets") || return 1
  jq -e 'type == "object"' >/dev/null 2>&1 <<<"$report" || return 1
  jq -r '"Network of the builder: \(.blockedDomains | length) blocked names, \(.blockedAddresses | length) blocked addresses" +
      (if .otherQueries > 0 then ", \(.otherQueries) more blocked queries" else "" end),
    (.blockedDomains[] | "  blocked name: \(.name) (\(.count) queries, \(.types | join(" ")))"),
    (.blockedAddresses[] | "  blocked address: \(.address) port \(.port) (\(.packets) packets)")' <<<"$report" >&2
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    jq -r '"### Builder network", "",
      (if (.blockedDomains | length) + (.blockedAddresses | length) == 0 then "Nothing blocked." else
        (.blockedDomains[] | "- blocked name `\(.name)` (\(.count) queries)"),
        (.blockedAddresses[] | "- blocked address `\(.address)` port \(.port) (\(.packets) packets)") end)' \
      <<<"$report" >>"$GITHUB_STEP_SUMMARY" || true
  fi
  printf '%s\n' "$report"
}

# Reads files of "builder" with its own rights, outside the sandbox, with system programs only.
as_reader() {
  [[ "$1" == /* ]] || die "reader commands need an absolute path, not $1"
  (cd / && /usr/bin/sudo -u "$BUILDER" -- "$@")
}

# copy_from_builder SRC DEST MAX_BYTES: fails (status 1) if SRC is not a regular file.
copy_from_builder() {
  local src=$1 dest=$2 max=$3 size
  as_reader /usr/bin/test -f "$src" || return 1
  size=$(as_reader /usr/bin/stat -L -c %s -- "$src")
  ((size <= max)) || die "$(basename "$src") is larger than $max bytes"
  as_reader /usr/bin/cat -- "$src" >"$dest"
}

# Stops every process of "builder" (the sandbox units first, then anything left) and checks
# that none of them got out of the sandbox.
stop_builder() {
  id -u "$BUILDER" &>/dev/null || return 0
  local unit
  for unit in "${UNITS[@]}"; do as_root /usr/bin/systemctl stop "$unit.service" 2>/dev/null || true; done
  for _ in {1..30}; do
    if ! pgrep -u "$BUILDER" >/dev/null && ! pgrep -U "$BUILDER" >/dev/null; then
      escape_check
      return 0
    fi
    as_root /usr/bin/pkill -KILL -u "$BUILDER" || true
    as_root /usr/bin/pkill -KILL -U "$BUILDER" || true
    sleep 1
  done
  die "processes of $BUILDER are still running"
}

# A process of "builder" outside the sandbox could leave programs that the runner runs later.
# Signs: "builder" asked to linger, or an entry of a directory in the job's PATH (or the
# directory itself) is owned by "builder", or is world-writable and changed after "builder" was
# created. Then the checkout goes, so the post step of actions/checkout runs no git, and the job
# fails.
escape_check() {
  local dir bad
  local -a found=() dirs=() suspect=(\( -user "$BUILDER" -o -perm -0002 -cnewer "$PRIV/builder-created" \) -print)
  if [[ -e "$LINGER_DIR/$BUILDER" ]]; then
    as_root /usr/bin/loginctl disable-linger "$BUILDER" || true
    found+=("$LINGER_DIR/$BUILDER")
  fi
  IFS=: read -ra dirs <<<"${JOB_PATH:-}"
  for dir in "${dirs[@]}"; do
    [[ "$dir" == /* && -e "$dir" ]] || continue
    bad=$({ find "$dir" -maxdepth 0 "${suspect[@]}" && find -H "$dir" -maxdepth 1 "${suspect[@]}"; } 2>/dev/null | sort -u) ||
      bad="$dir (cannot be checked)"
    [[ -z "$bad" ]] || found+=("$bad")
  done
  if ((${#found[@]} == 0)); then return 0; fi
  rm -rf -- "$REPO"
  die "$BUILDER may have run outside the sandbox: $(printf '%q ' "${found[@]:0:10}")"
}

# The agent can print to the log: no workflow commands (::...::) while it runs.
commands_off() {
  RESUME=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  echo "::stop-commands::$RESUME"
  trap commands_on EXIT
}
commands_on() {
  if [[ -n "${RESUME:-}" ]]; then echo "::$RESUME::"; fi
  RESUME=
}

prepare() {
  [[ "${GITHUB_EVENT_NAME:-}" == workflow_dispatch ]] || die "this workflow runs only on workflow_dispatch"
  [[ "${GITHUB_REF:-}" == refs/heads/main ]] || die "this workflow runs only on main"
  session_task
  [[ "${ROUTER_URL:-}" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._/-]*)?$ ]] || die "invalid ROUTER_URL"
  [[ -d "$REPO/.git" ]] || die "checkout not found in $REPO"
  if id -u "$BUILDER" &>/dev/null; then die "user $BUILDER already exists"; fi
  install -d -m 700 "$PRIV" "$PRIV/tmp"
  echo $(($(date +%s) - SETUP_MINUTES * 60)) >"$PRIV/job-start"

  # Tooling: root-owned, in a directory whose parents only root can write.
  local dir mode node_home uid
  dir=$(dirname "$TOOLS")
  while :; do
    mode=$(stat -c '%u %a' "$dir")
    [[ "${mode%% *}" == 0 && $((8#${mode#* } & 8#022)) == 0 ]] || die "$dir is writable by users other than root"
    [[ "$dir" == / ]] && break
    dir=$(dirname "$dir")
  done
  as_root /usr/bin/rm -rf "$TOOLS"
  as_root /usr/bin/install -d -o "$(id -u)" -m 755 "$TOOLS"
  cp -R "$REPO/.github/builder/." "$TOOLS/"
  (cd "$TOOLS" && npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund)
  node_home=$(dirname "$(dirname "$(readlink -f "$(command -v node)")")")
  [[ "$node_home" == "${RUNNER_TOOL_CACHE:?}"/node/* && -x "$node_home/bin/node" ]] || die "Node.js is not the one from actions/setup-node"
  cp -a "$node_home" "$TOOLS/node"
  as_root /usr/bin/chown -R root:root "$TOOLS"
  as_root /usr/bin/chmod -R go-w "$TOOLS"
  echo "Node.js $("$NODE" --version), tooling in $TOOLS"

  # The builder user: no sudo, no groups but its own, no login, no systemd user manager.
  touch "$PRIV/builder-created"
  as_root /usr/sbin/useradd --home-dir "$BHOME" --create-home --shell /usr/sbin/nologin --user-group "$BUILDER"
  as_root /usr/bin/chmod 700 "$BHOME"
  [[ "$(id -nG "$BUILDER")" == "$BUILDER" ]] || die "$BUILDER must belong only to its own group"
  uid=$(id -u "$BUILDER")
  as_root /usr/bin/systemctl mask --quiet "user@$uid.service"
  [[ "$(/usr/bin/systemctl is-enabled "user@$uid.service" 2>/dev/null || true)" == masked ]] || die "user@$uid.service is not masked"
  egress_on "$uid"

  # Its own clone of main, from a bundle: it never touches the runner's checkout.
  local base
  base=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}')
  printf '%s\n' "$base" >"$PRIV/base"
  git -C "$REPO" update-ref refs/heads/main "$base"
  git -C "$REPO" bundle create --quiet "$PRIV/in.bundle" refs/heads/main
  clone_for_builder
}

# The builder's clone of main, from the runner's bundle.
clone_for_builder() {
  as_root /usr/bin/install -o "$BUILDER" -g "$BUILDER" -m 600 "$PRIV/in.bundle" "$BHOME/in.bundle"
  as_builder builder-clone 600 "COMMIT_NAME=${COMMIT_NAME:?}" "COMMIT_EMAIL=${COMMIT_EMAIL:?}" -- /usr/bin/bash "$TOOLS/job.sh" sandbox-clone ||
    die "the builder could not clone the repository"
}

# Review only: install, test and build the commit under review before the session exists (no token, no outcome key),
# keep the results for the reviewer (data in $TOOLS, read-only for "builder"), then stop every process of "builder",
# wipe its home (no config, hook or file of the project survives) and clone again. The review agent only reads.
checks() {
  local kind
  kind=$(session_kind)
  [[ "$kind" == review ]] || { echo "No checks for a $kind session."; return 0; }
  stop_builder
  commands_off
  as_builder builder-checks "$CHECKS_SECONDS" CI=true -- /usr/bin/bash "$TOOLS/job.sh" sandbox-checks || true
  commands_on
  stop_builder
  rm -f "$PRIV/checks.json"
  if ! copy_from_builder "$BHOME/out/checks.json" "$PRIV/checks.json" "$MAX_CHECKS_BYTES" ||
    ! jq -e 'type == "object"' "$PRIV/checks.json" >/dev/null 2>&1; then
    echo '{"error":"the checks produced no results"}' >"$PRIV/checks.json"
  fi
  as_root /usr/bin/install -o root -g root -m 644 "$PRIV/checks.json" "$TOOLS/checks.json"
  as_root /usr/bin/find "$BHOME" -mindepth 1 -delete
  clone_for_builder
  jq -r '"checks: install \(.install.exit // "-"), test \(.test.exit // "-"), build \(.build.exit // "-")"' "$TOOLS/checks.json"
}

session() {
  (cd "$TOOLS" && BUILDER_ROUTER_URL="$ROUTER_URL" BUILDER_ROUTER_AUDIENCE="${ROUTER_AUDIENCE:?}" \
    BUILDER_SESSION_FILE="$PRIV/session.json" "$NODE" --import tsx cli.ts session) || die "no router session"
}

# Minutes the session may last: at most MAX_SESSION_MINUTES, and after the agent the job must
# still have AFTER_AGENT_MINUTES.
session_limit() {
  local left
  left=$((($(<"$PRIV/job-start") + JOB_MINUTES * 60 - $(date +%s)) / 60 - AGENT_GRACE_MINUTES - AFTER_AGENT_MINUTES))
  echo $((left < MAX_SESSION_MINUTES ? left : MAX_SESSION_MINUTES))
}

agent() {
  local minutes limit status=0
  session_task
  minutes=$(jq -e '.minutes | floor | select(. >= 1 and . <= 1440)' "$PRIV/session.json") || die "invalid session minutes"
  limit=$(session_limit)
  ((limit >= 1)) || die "no time left in the job for the session"
  if ((minutes > limit)); then
    echo "::warning::session shortened from $minutes to $limit minutes: the job needs the rest for the push and the build"
    minutes=$limit
  fi
  # The builder's copy of the session, with the minutes it may use (cli.ts reads it and deletes it).
  (umask 077 && jq -c --argjson minutes "$minutes" '.minutes = $minutes' "$PRIV/session.json" >"$PRIV/agent-session.json")
  as_root /usr/bin/install -o "$BUILDER" -g "$BUILDER" -m 600 "$PRIV/agent-session.json" "$BHOME/session.json"
  rm -f "$PRIV/agent-session.json"
  echo "Session: $minutes minutes"
  commands_off
  as_builder builder-agent $(((minutes + AGENT_GRACE_MINUTES) * 60)) \
    "BUILDER_ROUTER_URL=$ROUTER_URL" "BUILDER_SESSION_KIND=$KIND" "BUILDER_SESSION_ID=$SESSION" \
    "BUILDER_MILESTONE=$MILESTONE" "BUILDER_FOLLOWUP=$FOLLOWUP" "BUILDER_SESSION_FILE=$BHOME/session.json" \
    "BUILDER_PROJECT_DIR=$BHOME/project" "BUILDER_SUMMARY_FILE=$BHOME/out/summary.json" \
    "BUILDER_CHECKS_FILE=$TOOLS/checks.json" \
    -- "$NODE" --import tsx "$TOOLS/cli.ts" run || status=$?
  commands_on
  return "$status"
}

# Runs whenever the session was opened, also when the agent step was cancelled: the router
# session closes first, then "builder" stops and is checked before any other step of the job.
end_session() {
  if [[ -f "$PRIV/session.json" ]]; then
    (cd "$TOOLS" && BUILDER_ROUTER_URL="$ROUTER_URL" BUILDER_SESSION_FILE="$PRIV/session.json" "$NODE" --import tsx cli.ts end-session)
  fi
  stop_builder
}

push() {
  stop_builder
  local base head kind basic
  local -a only=()
  kind=$(session_kind)
  base=$(<"$PRIV/base")
  # Every check ends with "|| die": errexit does not apply inside conditions, so it is never relied on here.
  as_builder builder-export "$EXPORT_SECONDS" "BASE=$base" -- /usr/bin/bash "$TOOLS/job.sh" sandbox-export || die "the builder could not export its commits"
  stop_builder
  head=$base
  rm -f "$PRIV/changes.bundle" "$PRIV/head"
  if copy_from_builder "$BHOME/out/changes.bundle" "$PRIV/changes.bundle" "$MAX_BUNDLE_BYTES"; then
    git -C "$REPO" -c fetch.fsckObjects=true fetch --quiet --no-tags --no-write-fetch-head --no-recurse-submodules \
      "$PRIV/changes.bundle" '+refs/heads/main:refs/builder/main' || die "the builder's bundle is not valid"
    head=$(git -C "$REPO" rev-parse --verify 'refs/builder/main^{commit}') || die "the builder's bundle has no main"
    git -C "$REPO" merge-base --is-ancestor "$base" "$head" || die "the new commits do not continue main"
  fi
  if [[ "$head" == "$base" ]]; then
    echo "No new commits."
    printf '%s\n' "$head" >"$PRIV/head"
    return 0
  fi
  [[ "$kind" != review ]] || only=(--only PROGRESS.md)
  (cd "$TOOLS" && BUILDER_PROJECT_DIR="$REPO" "$NODE" --import tsx cli.ts check-diff "$base" "$head" "${only[@]}") ||
    die "the new commits change files this session may not change"
  [[ -n "${PUSH_TOKEN:-}" ]] || die "PUSH_TOKEN is missing"
  basic=$(printf 'x-access-token:%s' "$PUSH_TOKEN" | base64 -w0)
  echo "::add-mask::$basic"
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.https://github.com/.extraheader GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $basic" \
    git -C "$REPO" push --quiet --no-verify origin "$head:refs/heads/main" || die "push failed"
  printf '%s\n' "$head" >"$PRIV/head"
  echo "Pushed $(git -C "$REPO" rev-list --count "$base..$head") commits: $base..$head"
}

build() {
  stop_builder
  local head json dir=dist src app size bad status=0
  head=$(<"$PRIV/head")
  # Output directory: "outputDir" in project.json of the commit, read by the runner from its checkout.
  if json=$(git -C "$REPO" cat-file blob "$head:project.json" 2>/dev/null); then
    dir=$(jq -r '(objects | .outputDir | strings) // "dist"' <<<"$json") || die "project.json is not valid JSON"
  fi
  [[ "$dir" =~ ^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$ ]] || die "invalid outputDir in project.json"
  commands_off
  as_builder builder-build "$BUILD_SECONDS" "HEAD_SHA=$head" CI=true -- /usr/bin/bash "$TOOLS/job.sh" sandbox-build || status=$?
  commands_on
  ((status == 0)) || die "the build failed"
  stop_builder

  src="$BHOME/build/$dir"
  app="$OUT/app"
  [[ "$(as_reader /usr/bin/realpath -e -- "$src" 2>/dev/null)" == "$src" ]] || die "the build output $dir is missing or is a link"
  as_reader /usr/bin/test -d "$src" || die "the build output $dir is not a directory"
  size=$(as_reader /usr/bin/du -s -b -- "$src" | cut -f1)
  ((size <= MAX_APP_BYTES)) || die "the build output is larger than $MAX_APP_BYTES bytes"
  rm -rf "$app"
  mkdir -p "$app"
  as_reader /usr/bin/tar -C "$src" -cf - . | tar -C "$app" -xf - --no-same-owner --no-same-permissions
  bad=$(find "$app" -mindepth 1 ! -type f ! -type d -printf '%P\n' -quit)
  [[ -z "$bad" ]] || die "the build output may contain only regular files and directories, not $(printf '%q' "$bad")"
  [[ -n "$(find "$app" -type f -print -quit)" ]] || die "the build output is empty"
  chmod -R u=rwX,go=rX "$app"
  echo "Build output: $(find "$app" -type f | wc -l) files, $size bytes"
}

# The milestones of PLAN.md at a commit and the commits of the session, as JSON (cli.ts summary-facts), read by the
# runner from its own checkout: summary_facts BASE [HEAD].
summary_facts() {
  (cd "$TOOLS" && BUILDER_PROJECT_DIR="$REPO" "$NODE" --import tsx cli.ts summary-facts "$@")
}

# The summary for the platform: the agent's own (data the platform does not trust), with the runner's values on
# top: session, task, the commit the session started from and the commit pushed to main (null if the push did
# not happen), the milestones of PLAN.md at that commit and the session's commits (cli.ts summary-facts, read
# from the runner's checkout by summary_facts; titles and subjects are still the agent's text). agentSummary says whether
# the agent wrote one.
summary() {
  stop_builder
  local base head="" from_agent=true facts egress
  mkdir -p "$OUT"
  rm -f "$OUT/summary.json" "$PRIV/agent-summary.json"
  id -u "$BUILDER" &>/dev/null || return 0
  session_task
  base=$(<"$PRIV/base")
  if [[ -f "$PRIV/head" ]]; then head=$(<"$PRIV/head"); fi
  facts=$(summary_facts "$base" ${head:+"$head"}) || facts=''
  if ! jq -e 'type == "object"' >/dev/null 2>&1 <<<"$facts"; then
    echo "::warning::no plan or commits for the summary"
    facts='{"plan":null,"commits":[]}'
  fi
  if ! copy_from_builder "$BHOME/out/summary.json" "$PRIV/agent-summary.json" "$MAX_SUMMARY_BYTES"; then
    echo "No session summary from the agent."
    from_agent=false
  elif ! jq -e 'type == "object"' "$PRIV/agent-summary.json" >/dev/null 2>&1; then
    echo "::warning::summary.json is not a JSON object"
    from_agent=false
  fi
  if [[ "$from_agent" == false ]]; then echo '{}' >"$PRIV/agent-summary.json"; fi
  egress=$(egress_report) || egress=''
  if ! jq -e 'type == "object"' >/dev/null 2>&1 <<<"$egress"; then
    echo "::warning::no report from the network filter"
    egress=null
  fi
  jq -c --arg kind "$KIND" --arg session "$SESSION" --argjson milestone "$MILESTONE" --arg followup "$FOLLOWUP" \
    --arg base "$base" --arg head "$head" --argjson agent "$from_agent" --argjson facts "$facts" --argjson egress "$egress" \
    '. + {plan: $facts.plan, commits: $facts.commits} + {kind: $kind, sessionId: $session,
      milestone: (if $kind == "opening" then null else $milestone end), followup: $followup, baseCommit: $base,
      headCommit: (if $head == "" then null else $head end), agentSummary: $agent, egress: $egress}' \
    "$PRIV/agent-summary.json" >"$OUT/summary.json"
  rm -f "$PRIV/agent-summary.json"
}

# Sandbox phases: they run as "builder" (as_builder), inside its home only.
sandbox_clone() {
  cd "$BHOME"
  git clone --quiet --branch main in.bundle project
  rm -f in.bundle
  git -C project remote remove origin
  git -C project config user.name "$COMMIT_NAME"
  git -C project config user.email "$COMMIT_EMAIL"
  mkdir -p out
}

sandbox_export() {
  local head
  cd "$BHOME/project"
  rm -f "$BHOME/out/changes.bundle"
  head=$(git rev-parse --verify --quiet 'refs/heads/main^{commit}') || die "the branch main is missing"
  if [[ "$head" == "${BASE:?}" ]]; then
    echo "No new commits."
    return 0
  fi
  git bundle create --quiet "$BHOME/out/changes.bundle" "$BASE..refs/heads/main"
}

# Install, test and build in a throwaway clone; results as JSON (exit codes and the last 4 KB of each log).
sandbox_checks() {
  local install=1 test=1 build=1 present=false
  rm -rf "$BHOME/checks"
  mkdir -p "$BHOME/out"
  git clone --quiet "$BHOME/project" "$BHOME/checks"
  cd "$BHOME/checks"
  timeout 600 npm ci --no-audit --no-fund >"$BHOME/out/install.log" 2>&1 && install=0 || install=$?
  if [[ "$install" == 0 ]] && jq -e '.scripts.test | strings' package.json >/dev/null 2>&1; then
    present=true
    timeout 600 npm test >"$BHOME/out/test.log" 2>&1 && test=0 || test=$?
  else
    : >"$BHOME/out/test.log"
  fi
  if [[ "$install" == 0 ]]; then
    timeout 600 npm run build >"$BHOME/out/build.log" 2>&1 && build=0 || build=$?
  else
    : >"$BHOME/out/build.log"
  fi
  jq -n --argjson install "$install" --argjson test "$test" --argjson build "$build" --argjson present "$present" \
    --rawfile il <(tail -c 4000 "$BHOME/out/install.log") --rawfile tl <(tail -c 4000 "$BHOME/out/test.log") \
    --rawfile bl <(tail -c 4000 "$BHOME/out/build.log") \
    '{install: {exit: $install, tail: $il}, test: {exit: $test, present: $present, tail: $tl}, build: {exit: $build, tail: $bl}}' \
    >"$BHOME/out/checks.json"
}

sandbox_build() {
  rm -rf "$BHOME/build"
  git clone --quiet --no-checkout "$BHOME/project" "$BHOME/build"
  cd "$BHOME/build"
  git checkout --quiet --detach "${HEAD_SHA:?}"
  npm ci --no-audit --no-fund
  npm run build
}

main() {
  local phase=${1:-}
  case "$phase" in
    sandbox-clone | sandbox-checks | sandbox-export | sandbox-build)
      [[ "$(id -un)" == "$BUILDER" ]] || die "$phase runs only as $BUILDER"
      "${phase//-/_}"
      ;;
    prepare)
      runner_env
      prepare
      ;;
    checks | session | agent | end-session | push | build | summary)
      runner_env
      # The job's PATH, for escape_check; this script looks programs up only in root's directories.
      JOB_PATH=$PATH
      export PATH="$TOOLS/node/bin:/usr/sbin:/usr/bin:/sbin:/bin"
      "${phase//-/_}"
      ;;
    *) die "unknown phase: $(printf '%q' "$phase")" ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
