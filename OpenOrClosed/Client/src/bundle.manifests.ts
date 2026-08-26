import { manifests as clipboard } from './clipboard/manifest'
import { manifests as holidays } from './holidays/manifest'
import { manifests as localization } from './localization/manifest'
import { manifests as specialHours } from './special-hours/manifest'
import { manifests as rangeModal } from './timeline/manifest'
import { manifests as standardHours } from './standard-hours/manifest'
import { manifests as timeInput } from './time-input/manifest'
import { manifests as weeklyHours } from './weekly-hours/manifest'

// Job of the bundle is to collate all the manifests from different parts of the extension and load other manifests
// We load this bundle from umbraco-package.json
export const manifests: Array<UmbExtensionManifest> = [
  // First, so the dictionary is registered before anything resolves against it.
  ...localization,
  ...standardHours,
  ...specialHours,
  ...weeklyHours,
  ...holidays,
  ...rangeModal,
  ...timeInput,
  // Last, so every property editor UI it references is already registered.
  ...clipboard
];
