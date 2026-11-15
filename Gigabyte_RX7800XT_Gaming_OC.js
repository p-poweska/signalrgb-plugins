// SPDX-License-Identifier: GPL-2.0-or-later
// Modifying SMBUS Plugins is -DANGEROUS- and can -DESTROY- devices.
/*
 * SignalRGB plugin - Gigabyte Radeon RX 7800 XT GAMING OC 16G
 *   PCI 1002:747E, subsystem 1458:2413, RGB Fusion 2 GPU controller at I2C address 0x62
 *
 * The command sequence is a 1:1 port of OpenRGB's GigabyteRGBFusion2GPUController
 * (Direct mode, one color for the whole device), which is known to work on this card.
 * All writes are 8 bytes long, without a register:
 *   0x88 = zone mode:   [88, 01 (static), 00 (speed), 63 (max brightness), 00, zone + 1, 00, 00]
 *   0xB0 = color of zones 1-2, 0xB1 = color of zone 3, 0x40 = color of zones 4-5
 *
 * This plugin NEVER sends command 0xAA (save settings to the card's memory).
 * Address 0x62 requires 8-byte writes - a different length can lock up the controller.
 */
export function Name() { return "Gigabyte RX 7800 XT Gaming OC"; }
export function Publisher() { return "Pawel"; }
export function Type() { return "SMBUS"; }
export function Size() { return [3, 1]; }
export function DefaultPosition() { return [192, 127]; }
export function DefaultScale() { return 12.5; }
export function DeviceType() { return "gpu"; }
export function LedNames() { return vLedNames; }
export function LedPositions() { return vLedPositions; }
export function ConflictingProcesses() { return ["OpenRGB.exe", "RGBFusion.exe"]; }
export function ImageUrl() { return "https://assets.signalrgb.com/devices/brands/gigabyte/gpus/gpu.png"; }
/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/
export function ControllableParameters() {
	return [
		{"property":"shutdownColor", "group":"lighting", "label":"Shutdown Color", "description":"Applied to the card when SignalRGB or the system shuts down", "min":"0", "max":"360", "type":"color", "default":"#000000"},
		{"property":"LightingMode", "group":"lighting", "label":"Lighting Mode", "description":"Canvas uses the active SignalRGB effect, Forced uses a single static color", "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color", "description":"The color used when Lighting Mode is set to Forced", "min":"0", "max":"360", "type":"color", "default":"#009bde"},
	];
}

const vLedNames = ["GPU"];
const vLedPositions = [[1, 0]];

// Exactly this card - nothing else is touched.
const CARD = {
	Vendor: 0x1002,      // AMD
	Device: 0x747E,      // Navi 32 (RX 7800 XT)
	SubVendor: 0x1458,   // Gigabyte
	SubDevice: 0x2413,   // RX 7800 XT GAMING OC 16G
	Address: 0x62,
};

const WRITE_LENGTH = 8;
const ZONE_COUNT = 5;
const MODE_STATIC = 0x01;
const SPEED = 0x00;
const BRIGHTNESS_MAX = 0x63;
const MIN_FRAME_MS = 50;

/** @param {FreeAddressBus} bus */
export function Scan(bus) {
	if (!bus.IsAMDGpuBus()) {
		return [];
	}

	if (bus.Vendor() !== CARD.Vendor || bus.Product() !== CARD.Device ||
		bus.SubVendor() !== CARD.SubVendor || bus.SubDevice() !== CARD.SubDevice) {
		return [];
	}

	bus.log("Found Gigabyte RX 7800 XT Gaming OC, checking controller at 0x62", {toFile: true});

	try {
		// Same probe as OpenRGB: write 0xAB (8 bytes), read back 4 bytes.
		bus.WriteBlockWithoutRegister(CARD.Address, WRITE_LENGTH, [0xAB, 0, 0, 0, 0, 0, 0, 0]);

		const result = bus.ReadBlockWithoutRegister(CARD.Address, 4);
		const data = result[1];

		bus.log(`Controller response: [${data}], error: [${result[0]}]`, {toFile: true});

		// A bus that echoes the written byte back is a mirror, not a controller.
		const isMirror = data[1] === 0xAB && data[2] === 0xAB && data[3] === 0xAB;

		if (data[0] !== 0xAB || isMirror) {
			bus.log("Controller did not respond as expected - skipping card", {toFile: true});

			return [];
		}
	} catch (e) {
		bus.log(`Controller probe failed: ${e} - skipping card`, {toFile: true});

		return [];
	}

	return [CARD.Address];
}

let lastColor = null;
let lastSend = 0;

export function Initialize() {
	device.setName("Gigabyte RX 7800 XT Gaming OC");
	lastColor = null;
	lastSend = 0;
}

export function Render() {
	const now = Date.now();

	if (now - lastSend < MIN_FRAME_MS) {
		return;
	}

	const color = LightingMode === "Forced"
		? hexToRgb(forcedColor)
		: device.color(vLedPositions[0][0], vLedPositions[0][1]);

	if (lastColor && color[0] === lastColor[0] && color[1] === lastColor[1] && color[2] === lastColor[2]) {
		return;
	}

	lastColor = color;
	lastSend = now;
	setAllZones(color);
}

export function Shutdown(SystemSuspending) {
	setAllZones(hexToRgb(SystemSuspending ? "#000000" : shutdownColor));
}

// Same sequence OpenRGB sends in Direct mode with one color for the whole device.
function setAllZones(color) {
	const [r, g, b] = color;

	for (let zone = 0; zone < ZONE_COUNT; zone++) {
		writePacket([0x88, MODE_STATIC, SPEED, BRIGHTNESS_MAX, 0x00, zone + 1, 0x00, 0x00]);

		if (zone <= 1) {
			writePacket([0xB0, MODE_STATIC, r, g, b, r, g, b]);
		} else if (zone === 2) {
			writePacket([0xB1, MODE_STATIC, r, g, b, 0x00, 0x00, 0x00]);
		} else {
			writePacket([0x40, r, g, b, zone + 1, 0x00, 0x00, 0x00]);
		}
	}
}

function writePacket(packet) {
	if (packet.length !== WRITE_LENGTH || packet[0] === 0xAA) {
		device.log("Rejected invalid packet");

		return;
	}

	const result = bus.WriteBlockWithoutRegister(WRITE_LENGTH, packet);

	if (result !== undefined && result < 0) {
		device.log(`I2C write error: ${result}`);
	}
}

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

	if (!result) {
		return [0, 0, 0];
	}

	return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}
