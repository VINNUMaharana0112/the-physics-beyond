import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { schemaTypes } from './src/schemaTypes'
import { structure } from './src/structure'
import { dataset, projectId } from './src/env'

export default defineConfig({
  name: 'the-physics-beyond',
  title: 'The Physics Beyond — Publishing',
  projectId,
  dataset,
  plugins: [structureTool({ structure })],
  schema: { types: schemaTypes }
})
