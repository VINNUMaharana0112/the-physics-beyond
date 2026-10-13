import { defineCliConfig } from 'sanity/cli'
import { dataset, projectId } from './src/env'

export default defineCliConfig({
  studioHost: 'the-physics-beyond',
  deployment: {
    appId: 'cyfg51qg3t1pvc8k8sffv13o'
  },
  api: {
    projectId,
    dataset
  }
})
