# Local recovery rehearsal

`RecoveryDryRunPanel` is mounted by `RecoveryCenter`. It estimates storage
headroom for a **manual** selection of pack IDs. No download, deletion, file
write, scheduled action or network call occurs during a calculation.

The user supplies storage capacity and reserve. The engine does not silently
read device capacity, invent pack sizes or promote UNKNOWN statuses. Only
packs with a known size, an open licence, a source and a valid source date
are considered candidates. A candidate is a possible storage allocation,
not a statement that the pack has been checked or that any place is accessible.

An optional save callback exports an explicitly requested JSON document. The
report includes original source name, licence and date with every candidate;
its inspection date is supplied by the host. Each record also includes a
user-selected evidence tier, defaulting to UNKNOWN. Existing packages remain intact.

Tests cover capacity limits, source restrictions, duplicate and unsafe IDs,
priority order, unknown preservation, deterministic reporting and both copy
sets. The interface uses the host's existing locale and reaches the user via
`RecoveryCenter` on the live offline recovery route.
