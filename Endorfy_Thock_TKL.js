// SPDX-License-Identifier: GPL-2.0-or-later
/*
 * SignalRGB plugin - Endorfy Thock TKL (wired), EVision controller, USB 3299:0059
 *
 * Protocol (captured from the official Endorfy software and verified on the keyboard):
 *   Output report 0x04, 64 bytes, interface 1, usage page 0xFF1C, usage 0x92
 *   04 CK_LO CK_HI CMD LEN OFS_LO OFS_HI 00 [data]     CK = sum of all bytes from CMD onward
 *   CMD 0x12 = live colors, NOT saved to the keyboard's memory:
 *              128 LEDs x RGB = 384 bytes, LED index = column * 8 + row
 *   When data stops arriving, the keyboard returns to its saved lighting effect.
 *
 * This plugin intentionally does NOT use CMD 0x0B. That command writes the custom
 * colors to the keyboard's flash memory: the LEDs blink on every frame and the flash wears out.
 * Never write more than 384 color bytes.
 *
 * Packet framing and checksum adapted from guigdm92/signalrgb-redragon-k556-plugin (MIT),
 * see THIRD_PARTY_NOTICES.md.
 */

export function Name() { return "Endorfy Thock TKL"; }
export function VendorId() { return 0x3299; }
export function ProductId() { return 0x0059; }
export function Publisher() { return "Pawel"; }
export function Size() { return [17, 6]; }
export function DefaultPosition() { return [10, 100]; }
export function DefaultScale() { return 8.0; }
export function DeviceType() { return "keyboard"; }
export function ImageUrl() { return ""; }

export function Validate(endpoint) {
	return endpoint.interface === 1 && endpoint.usage === 0x0092 && endpoint.usage_page === 0xFF1C;
}

/* global
LightingMode:readonly
forcedColor:readonly
*/
export function ControllableParameters() {
	return [
		{property:"LightingMode", group:"lighting", label:"Lighting Mode", description:"Canvas uses the active SignalRGB effect, Forced uses a single static color", type:"combobox", values:["Canvas", "Forced"], default:"Canvas"},
		{property:"forcedColor", group:"lighting", label:"Forced Color", description:"The color used when Lighting Mode is set to Forced", min:"0", max:"360", type:"color", default:"#009bde"},
	];
}

export function ConflictingProcesses() {
	return ["Endorfy Wired Keyboards.exe"];
}

const PACKET_LENGTH = 64;
const LED_COUNT = 128;
const COLOR_BYTES = LED_COUNT * 3;   // 384. Do NOT increase.
const CMD_LIVE = 0x12;
const CHUNK = 48;
const FRAME_MS = 50;                 // about 20 frames per second
const PACKET_PAUSE_MS = 2;
const KEEPALIVE_MS = 300;            // without data the firmware falls back to its own effect

// ANSI TKL layout, 87 keys. LED index = column * 8 + row.
const vKeyNames = [
	"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Print Screen", "Scroll Lock", "Pause Break",
	"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace", "Insert", "Home", "Page Up",
	"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\", "Del", "End", "Page Down",
	"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter",
	"Left Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Right Shift", "Up Arrow",
	"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow",
];

const vKeys = [
	0,     8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,      104, 112, 120,
	1,  9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,    113, 121, 115,
	2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,    114, 122, 123,
	3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91,     107,
	4,     20, 28, 36, 44, 52, 60, 68, 76, 84, 92,     108,         116,
	5, 13, 21,             29,             77, 85, 93, 101,    109, 117, 125,
];

const vKeyPositions = [
	[0, 0],         [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0],   [14, 0], [15, 0], [16, 0],
	[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],   [14, 1], [15, 1], [16, 1],
	[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],   [14, 2], [15, 2], [16, 2],
	[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3],          [13, 3],
	[0, 4],         [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],          [13, 4],            [15, 4],
	[0, 5], [1, 5], [2, 5],                         [6, 5],                         [10, 5], [11, 5], [12, 5], [13, 5],   [14, 5], [15, 5], [16, 5],
];

export function LedNames() { return vKeyNames; }
export function LedPositions() { return vKeyPositions; }

let lastFrame = "";
let lastSend = 0;

export function Initialize() {
	lastFrame = "";
	lastSend = 0;
}

export function Render() {
	const now = Date.now();

	if (now - lastSend < FRAME_MS) { return; }

	const rgbData = new Array(COLOR_BYTES).fill(0);

	for (let idx = 0; idx < vKeys.length; idx++) {
		const color = LightingMode === "Forced"
			? hexToRgb(forcedColor)
			: device.color(vKeyPositions[idx][0], vKeyPositions[idx][1]);
		const offset = vKeys[idx] * 3;

		rgbData[offset]     = color[0];
		rgbData[offset + 1] = color[1];
		rgbData[offset + 2] = color[2];
	}

	// If nothing changed, only send a keepalive every 300 ms.
	const frameKey = rgbData.join(",");

	if (frameKey === lastFrame && now - lastSend < KEEPALIVE_MS) { return; }

	lastFrame = frameKey;
	lastSend = now;

	for (let offset = 0; offset < COLOR_BYTES; offset += CHUNK) {
		sendPacket(CMD_LIVE, offset, rgbData.slice(offset, offset + CHUNK));
	}
}

export function Shutdown(SystemSuspending) {
	// Nothing to send: the keyboard returns to its saved effect on its own.
}

function sendPacket(cmd, offset, data) {
	if (offset + data.length > COLOR_BYTES) { return; }

	const packet = new Array(PACKET_LENGTH).fill(0);

	packet[0] = 0x04;
	packet[3] = cmd;
	packet[4] = data.length;
	packet[5] = offset & 0xFF;
	packet[6] = (offset >> 8) & 0xFF;

	for (let i = 0; i < data.length; i++) { packet[8 + i] = data[i]; }

	let sum = 0;

	for (let i = 3; i < PACKET_LENGTH; i++) { sum += packet[i]; }

	packet[1] = sum & 0xFF;
	packet[2] = (sum >> 8) & 0xFF;

	device.write(packet, PACKET_LENGTH);
	device.pause(PACKET_PAUSE_MS);
}

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

	if (!result) { return [0, 0, 0]; }

	return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}
