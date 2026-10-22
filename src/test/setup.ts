import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// No vitest globals, so RTL's auto-cleanup never registers.
afterEach(cleanup);
