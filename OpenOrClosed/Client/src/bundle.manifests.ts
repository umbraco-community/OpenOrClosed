import { manifests as specialHours } from './special-hours/manifest'
import { manifests as standardHours } from './standard-hours/manifest'
import { manifests as timeInput } from './time-input/manifest'
import { manifests as weeklyHours } from './weekly-hours/manifest'

// Job of the bundle is to collate all the manifests from different parts of the extension and load other manifests
// We load this bundle from umbraco-package.json
export const manifests: Array<UmbExtensionManifest> = [
  ...standardHours,
  ...specialHours,
  ...weeklyHours,
  ...timeInput
];
