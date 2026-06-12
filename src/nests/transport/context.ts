import { createContext } from "react";
import type { NestTransport } from "./types";

/**
 * React context for the transport instance.
 */
export const NestTransportContext = createContext<NestTransport | null>(null);
