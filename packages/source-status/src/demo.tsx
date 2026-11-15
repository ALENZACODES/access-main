import { createRoot } from "react-dom/client";
import { Dashboard } from "./Dashboard.tsx";
import { DEMONSTRATION_REGISTER } from "./fixtures/demonstration.ts";

const element = document.getElementById("root");
if (!element) throw new Error("Missing dashboard root");
createRoot(element).render(<Dashboard register={DEMONSTRATION_REGISTER} />);
