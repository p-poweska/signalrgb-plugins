# SignalRGB plugins

Unofficial [SignalRGB](https://signalrgb.com) plugins for devices that SignalRGB does not support out of the box.

| Device | Plugin file | Connection | IDs |
|---|---|---|---|
| Endorfy Thock TKL (wired) | `Endorfy_Thock_TKL.js` | USB | `3299:0059` |
| Gigabyte Radeon RX 7800 XT GAMING OC 16G | `Gigabyte_RX7800XT_Gaming_OC.js` | GPU I2C (SMBus) | PCI `1002:747E`, subsystem `1458:2413` |

Each plugin only starts when it finds its exact device, so it is safe to install both even if you own only one of them.

> [!WARNING]
> These plugins are community projects, not affiliated with Endorfy, Gigabyte, AMD or WhirlwindFX (SignalRGB).
> Each one has been tested on a single unit of the listed device. Use them at your own risk.

## Installation

1. Download the plugin file for your device (open the file above, then use **Download raw file**).
2. Copy it to `Documents\WhirlwindFX\Plugins`. If the folder does not exist, start SignalRGB once and close it, or create the folder yourself.
3. Close the manufacturer's software and any other RGB software (see the device sections below), including their tray icons.
4. Fully quit SignalRGB from the tray icon (closing the window is not enough) and start it again.
5. The device appears under **Devices**. Try **Lighting Mode: Forced** with a clear color first, then switch to **Canvas**.

## Endorfy Thock TKL

- Wired version only, US ANSI layout, 87 keys. Other Thock models (V2, wireless, other sizes) use different USB IDs, so the plugin will not load for them.
- Close **Endorfy Wired Keyboards** before using SignalRGB. The plugin waits while it is running.
- Smooth effects at about 20 frames per second. Nothing is written to the keyboard's memory.
- When SignalRGB closes, the keyboard goes back to its own saved lighting effect after a moment.

**If the keyboard misbehaves**, unplug it and plug it back in. A factory reset is **Fn + Esc** held for 3 seconds (Fn is the key with the Endorfy logo).

### How it works

The keyboard uses an EVision controller (interface 1, usage page `0xFF1C`, usage `0x92`). Packets are 64-byte output reports:

```
04 CK_LO CK_HI CMD LEN OFS_LO OFS_HI 00 [data]      CK = sum of all bytes from CMD onward
```

| CMD | Purpose |
|---|---|
| `0x12` | Live colors, not saved. 128 LEDs × RGB = 384 bytes, sent in 8 packets of 48 bytes. LED index = column × 8 + row (Esc = 0, Right Ctrl = 101). **Used by this plugin.** |
| `0x0B` | Custom colors **saved to flash**, used by the official software. The LEDs turn off for every write and the flash wears out. **Not used.** |
| `0x01` / `0x06` / `0x02` | Begin / configuration (mode `0x14` = custom) / end. **Not used.** |

## Gigabyte Radeon RX 7800 XT GAMING OC

- The official SignalRGB Gigabyte GPU plugins only scan NVIDIA cards, which is why this AMD card is not detected.
- Close **Gigabyte Control Center** and **OpenRGB**. The plugin waits while `OpenRGB.exe` is running, because two programs must not talk to the same I2C bus at once.
- The whole card shows one color.
- Nothing is saved to the card. When SignalRGB closes, the card shows the **Shutdown Color** (black by default) until the next restart, when it returns to its own saved effect.

### How it works

The card has an RGB Fusion 2 GPU controller at I2C address `0x62`. The plugin:

1. Runs only on an AMD GPU bus with exactly the IDs listed above.
2. Probes the controller the same way OpenRGB does (write `0xAB`, read 4 bytes) and does nothing if the answer is wrong.
3. Sends the same 8-byte packets as OpenRGB's Direct mode, for each of the 5 zones:
   ```
   88 01 00 63 00 <zone+1> 00 00     mode: static, speed 0, max brightness
   B0 01 R G B R G B                 zones 1-2
   B1 01 R G B 00 00 00              zone 3
   40 R G B <zone+1> 00 00 00        zones 4-5
   ```
4. Only writes when the color changes, at most every 50 ms.
5. Never sends `0xAA` (save to card memory). Every write is 8 bytes long: a different length can lock up this controller.

## Troubleshooting

- **The device does not appear:** check that the file is in `Documents\WhirlwindFX\Plugins` and ends in `.js`, and that SignalRGB was fully restarted from the tray icon.
- **Colors flicker or do not change:** another RGB program is still running. Close it, including its tray icon.
- **The GPU is not detected:** open the device console in SignalRGB and look for lines starting with `Found Gigabyte RX 7800 XT` and `Controller response`. Include them when you report a problem.

## Reporting a problem or a new device

Open an issue and include:
- the exact model and, for USB devices, the Vendor ID and Product ID from **SignalRGB → Settings → Device Information**,
- for GPUs, the **Hardware Ids** from Windows Device Manager (Display adapters → your card → Properties → Details),
- the relevant lines from the SignalRGB device console.

This is a hobby project, so there is no guarantee of support or of new devices being added.

## Credits

- [OpenRGB](https://openrgb.org) - the Gigabyte RGB Fusion 2 GPU command sequence, device IDs and controller address come from OpenRGB's `GigabyteRGBFusion2GPUController` (GPL-2.0-or-later).
- [guigdm92/signalrgb-redragon-k556-plugin](https://github.com/guigdm92/signalrgb-redragon-k556-plugin) - EVision packet framing and checksum (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- [taqee/signalrgb-redragon-k552-rgb2](https://github.com/taqee/signalrgb-redragon-k552-rgb2) - reference for the EVision LED matrix and the live color command.
- [SignalRGB developer documentation](https://docs.signalrgb.com/developer/plugins/) - plugin structure and the USB capture guide.

## License

[GPL-2.0-or-later](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
