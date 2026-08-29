/** Camera orientation values and labels used by Home Assistant's selector. */
export const CAMERA_ORIENTATION_OPTIONS = [
  ["none", "No orientation transform"],
  ["rotate_90", "→ Rotate 90°"],
  ["rotate_180", "↓ Rotate 180°"],
  ["rotate_270", "← Rotate 270°"],
  ["flip_horizontal", "↔ Flip horizontally"],
  ["flip_vertical", "↕ Flip vertically"],
  ["flip_horizontal_and_rotate_90", "↔→ Flip horizontally and rotate 90°"],
  ["flip_vertical_and_rotate_90", "↕→ Flip vertically and rotate 90°"],
];

export const orientationTransform = (orientation) => ({
  rotate_90: "rotate(90deg)",
  rotate_180: "rotate(180deg)",
  rotate_270: "rotate(270deg)",
  flip_horizontal: "scaleX(-1)",
  flip_vertical: "scaleY(-1)",
  flip_horizontal_and_rotate_90: "rotate(90deg) scaleX(-1)",
  flip_vertical_and_rotate_90: "rotate(90deg) scaleY(-1)",
}[orientation] || "none");
