// Tactical Archive PC: thresholds for "is this screenshot a battle result (戦闘履歴) screen?"
//
// Every value is measured on the screenshot after it is resized to the canonical size
// (16:9 = 1920x1080, 4:3 = 1600x1200) and cropped with the current crop layout.
// The measured values of each screenshot are written to the result detection log
// (Settings -> リザルト判定ログを開く), so these numbers can be tuned with real screenshots.
//
// Decision:
//   result = MODAL_WHITE ok AND TEXTURED_SLOTS ok AND (ATTACK_ICON strong OR (WIN/LOSE ok AND FRAME ok))
window.TA_RESULT_DETECTION = {
    // A pixel counts as "white" when R, G and B are all above this value
    WHITE_MIN_RGB: 195,

    // Share of white pixels inside the result card (0..1). The card is mostly white.
    MIN_MODAL_WHITE: 0.35,

    // Frame check: passes when EITHER the area above/below the card is mostly not white
    // (the game dims the background) OR the card is clearly brighter than that area.
    MAX_OUTSIDE_WHITE: 0.30,
    MIN_LUMA_CONTRAST: 25,

    // WIN / LOSE area: gold pixels (WIN) or grey pixels (LOSE), out of 280 x 160 = 44,800 pixels
    WIN_MIN_GOLD: 300,
    LOSE_MIN_GREY: 800,

    // Student slots: a slot "has a picture" when the brightness standard deviation is at least SLOT_MIN_STD;
    // at least MIN_TEXTURED_SLOTS of the 12 slots must have one
    SLOT_MIN_STD: 22,
    MIN_TEXTURED_SLOTS: 8,

    // Attack / defense icon: ZNCC with the attack icon template. At or above this value the screenshot is
    // treated as an attack result even if the WIN/LOSE or frame check fails (defense results score low,
    // so they rely on the WIN/LOSE + frame checks).
    ATTACK_ICON_STRONG: 0.65
};
