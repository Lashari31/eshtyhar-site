import { defineConfig } from 'vite'

// base: './' emits relative asset URLs so the build works both at a domain root
// and under a GitHub Pages project subpath (username.github.io/<repo>/).
export default defineConfig({
  base: './',
})
