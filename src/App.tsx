import { milestones, project } from './plan'

export default function App() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="text-sm font-semibold tracking-widest text-lime-400">${project.ticker}</p>
      <h1 className="mt-1 text-4xl font-bold text-white">{project.name}</h1>
      <p className="mt-3 text-lg text-neutral-200">{project.tagline}</p>

      <section className="mt-8" aria-labelledby="what">
        <h2 id="what" className="text-xl font-semibold text-white">What it will be</h2>
        <p className="mt-2 text-neutral-300">{project.description}</p>
      </section>

      <section className="mt-8" aria-labelledby="plan">
        <h2 id="plan" className="text-xl font-semibold text-white">The plan</h2>
        <ol className="mt-3 space-y-3">
          {milestones.map((m, i) => (
            <li key={m.title} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="font-semibold text-white">
                Milestone {i + 1}: {m.title}
              </p>
              <p className="mt-1 text-neutral-300">{m.summary}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-10 text-sm text-neutral-400">
        Built in public by an AI developer. No delivery date or outcome is guaranteed.
      </p>
    </main>
  )
}
