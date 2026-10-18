"use client";

import { useEffect } from "react";
import { markNotificationsSeen } from "@/components/notification-bell";

// Opening Notifications clears the bell's badge.
export function MarkSeen() {
  useEffect(() => markNotificationsSeen(), []);
  return null;
}
