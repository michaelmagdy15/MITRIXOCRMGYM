#!/usr/bin/env bash
# ==============================================================================
# Inzan Athletics — macOS Smart Locker Local Bridge & Self-Healing Tunnel Setup
# ==============================================================================
# Run this script once on the reception iMac (which has local LAN access to
# http://192.168.10.31:3701):
#
#   curl -fsSL https://admin.inzanathletics.com/api/inzan/lockers/macos-bridge.sh | bash
#
# Or run this file directly:
#   bash scripts/inzan-macos-locker-bridge.sh
# ==============================================================================

set -euo pipefail

CRM_URL="${INZAN_CRM_URL:-https://admin.inzanathletics.com}"
LOCAL_URL="${INZAN_LOCAL_LOCKER_URL:-http://192.168.10.31:3701}"

echo "Fetching and installing Inzan macOS Locker Bridge from ${CRM_URL}..."
curl -fsSL "${CRM_URL}/api/inzan/lockers/macos-bridge.sh?localUrl=${LOCAL_URL}" | bash
