import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installNetworkLog } from "./inference/netlog";
import { setRouter } from "./inference";
import { WebInferenceRouter } from "./inference/webRouter";
import { checkOnDevice } from "./inference/availability";
import { setModelStatus } from "./inference/status";
import { cloudConfigured } from "./firebase";
import "./styles.css";

installNetworkLog();
setRouter(new WebInferenceRouter());
setModelStatus({ cloudConfigured });
void checkOnDevice();

createRoot(document.getElementById("root")!).render(<App />);
