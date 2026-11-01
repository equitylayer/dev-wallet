// Font faces live in a plain module, not in a `.css.ts` file: vanilla-extract
// drops side-effect CSS imports from `.css.ts`, so @font-face never shipped.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
