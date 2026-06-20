import './style.css'

// Full UI is wired in src/ui/app.ts during the player-UI phase. This placeholder
// keeps the build green from the very first commit.
const app = document.querySelector<HTMLDivElement>('#app')
if (app) {
  app.innerHTML = `<main class="boot"><h1>crux</h1><p>loading…</p></main>`
}
