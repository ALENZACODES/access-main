import { SHELL_CONTRACT_VERSION } from "@access/shared";

export const BUILD_ID = import.meta.env.VITE_BUILD_ID || "dev";
export const CONTRACT_VERSION = SHELL_CONTRACT_VERSION;
