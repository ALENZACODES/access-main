# Privacy of the shell

Preferences are stored in IndexedDB on the device, under the database name `access-app`. The record type is `user_profile`. `storage` is always `device-only`. `account_status` is always `anonymous`.

The profile can hold a language, an optional municipality name the person typed, optional equipment and transfer choices, optional chair dimensions, a route preference, display choices, and a Wi-Fi preference for later downloads. It does not hold a washroom interval, a continuous-travel limit, or a pressure-relief reminder. Those keys are rejected.

The profile cannot hold a diagnosis, an injury level, medication, a health-card number, a location history, a remote notification channel, or a list of places. Saving runs `validateProfile`, which rejects those fields. The settings page does not call geolocation.

Nothing is stored until the person ticks the consent box. Withdraw consent clears the entered fields and sets `withdrawn_at`. Delete removes the profile record. Export downloads plain text of the entered fields. JSON is a second download. Removing cached records is a separate action on the data status page and does not upload anything, because this shell has no server.

French and English UI strings are part of the app bundle, not a request to a translation service.

This note is a description of the code. It is not a privacy-impact assessment.
