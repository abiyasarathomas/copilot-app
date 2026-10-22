import type { CapacitorConfig } from "@capacitor/cli";

// The phone apps bundle the same web build from /dist.
const config: CapacitorConfig = {
  appId: "app.copilot.brief",
  appName: "Co-Pilot",
  webDir: "dist",
  plugins: {
    LocalNotifications: { iconColor: "#1f6f5c" },
  },
};

export default config;
