import { defineConfig } from 'vite'

import { outDir } from './vite.config'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false,
    modulePreload: false,
    outDir,
    rollupOptions: {
      input: {
        inpage: 'src/entries/inpage/index.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
      plugins: [
        {
          name: 'try-catch',
          generateBundle(_, context) {
            Object.values(context).forEach((bundle: any) => {
              bundle.code = `(function(){try{${bundle.code}}catch{}}())`
            })
          },
        },
      ],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
})
