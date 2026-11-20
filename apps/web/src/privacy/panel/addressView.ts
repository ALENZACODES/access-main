// The two address lists the panel shows, as one value.

import type { AddressRow, CallRow } from "./addressRegister";

export interface AddressRegisterView {
  addresses: readonly AddressRow[];
  calls: readonly CallRow[];
}
