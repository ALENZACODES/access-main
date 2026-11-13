# Privacy of the shell

Preferences are stored in IndexedDB on the device, under the database name `access-app`. The record type is `user_profile`. `storage` is always `device-only`. `account_status` is always `anonymous`.

The profile can hold a language, an optional municipality name the person typed, optional equipment and transfer choices, optional chair dimensions, optional timing numbers, display choices, and a Wi-Fi preference for later downloads. Timing numbers are stored only when the person enters them. There is no default interval.

The profile cannot hold a diagnosis, an injury level, medication, a health-card number, a location history, a remote notification channel, or a list of places. Saving runs `validateProfile`, which rejects those fields. The settings page does not call geolocation.

Export downloads a JSON file in the browser. Delete removes the profile record. Removing cached records is a separate action on the data status page and does not upload anything, because this shell has no server.

French and English UI strings are part of the app bundle, not a request to a translation service.

This note is a description of the code. It is not a privacy-impact assessment.
