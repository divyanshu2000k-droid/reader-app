/**
 * Gate 1: this build is retired. No dismiss, by design — see forceUpdatePolicy.ts for
 * why reaching this screen is deliberately hard.
 *
 * The button's destination is derived from the package id, never from the payload.
 * `Linking.openURL` can still reject (no Play Store on some emulators and OEM images), so
 * a failed open is caught and the screen stays usable rather than throwing on the one
 * screen the reader cannot leave.
 */

import { useState } from 'react'
import { Linking } from 'react-native'

import { storeUrl } from '../forceUpdate'
import type { UpdateRequirement } from '../forceUpdatePolicy'
import { appVersion } from '@/lib/config'
import { launch } from '@/lib/strings'
import { Notice } from '@/ui/Notice'

export function UpdateRequired({ requirement }: { requirement: UpdateRequirement }) {
  const url = storeUrl()
  const [openFailed, setOpenFailed] = useState(false)

  const body = requirement.message ?? launch.update.body

  return (
    <Notice
      icon="download"
      glow="upper"
      title={launch.update.title}
      body={url && !openFailed ? body : `${body} ${launch.update.noStore}`}
      actionLabel={url ? launch.update.action : undefined}
      onAction={
        url
          ? () => {
              Linking.openURL(url).catch(() => setOpenFailed(true))
            }
          : undefined
      }
      footer={appVersion ? `Version ${appVersion}` : undefined}
    />
  )
}
