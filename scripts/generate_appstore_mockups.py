import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

out_dir = r"mobile/screenshots"
os.makedirs(out_dir, exist_ok=True)

WIDTH = 1290
HEIGHT = 2796

screens = [
    {
        "src": os.path.join(out_dir, "01_inzan_home_pass.png"),
        "tag": "INZAN ATHLETICS",
        "title": "ALL-ACCESS PASS",
        "subtitle": "Instant reception check-in, PT credits & announcements",
        "out": os.path.join(out_dir, "appstore_01_home_pass.png")
    },
    {
        "src": os.path.join(out_dir, "02_inzan_bookings_schedule.png"),
        "tag": "GROUP & PT SCHEDULES",
        "title": "RESERVE CLASSES & PT",
        "subtitle": "Real-time timetable booking with certified coaches",
        "out": os.path.join(out_dir, "appstore_02_class_bookings.png")
    },
    {
        "src": os.path.join(out_dir, "03_inzan_workouts_library.png"),
        "tag": "ATHLETIC PERFORMANCE",
        "title": "1,500+ EXERCISE VAULT",
        "subtitle": "HD animated movement demos & coach training plans",
        "out": os.path.join(out_dir, "appstore_03_workouts_library.png")
    },
    {
        "src": os.path.join(out_dir, "04_inzan_member_profile.png"),
        "tag": "SEAMLESS ACCOUNT MANAGEMENT",
        "title": "YOUR MEMBER HUB",
        "subtitle": "Track training history, active plans & account settings",
        "out": os.path.join(out_dir, "appstore_04_member_profile.png")
    }
]

# Fonts
def get_font(size, bold=False):
    # Try Windows system fonts
    font_paths = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"
    ]
    for p in font_paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

font_tag = get_font(34, bold=True)
font_title = get_font(72, bold=True)
font_sub = get_font(38, bold=False)

for item in screens:
    if not os.path.exists(item["src"]):
        print(f"Skipping {item['src']} (not found)")
        continue

    # 1. Base canvas with luxury dark gradient
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (8, 8, 10, 255))
    draw = ImageDraw.Draw(canvas)

    # Subtle radial glow at the top
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for r in range(400, 0, -20):
        alpha = int((1 - r / 400.0) * 45)
        glow_draw.ellipse(
            [WIDTH // 2 - r * 1.5, 300 - r, WIDTH // 2 + r * 1.5, 300 + r],
            fill=(255, 255, 255, alpha)
        )
    canvas = Image.alpha_composite(canvas, glow)
    draw = ImageDraw.Draw(canvas)

    # 2. Text Header
    # Tag
    draw.text((WIDTH // 2, 160), item["tag"], fill=(160, 160, 175, 255), font=font_tag, anchor="mm")
    # Title
    draw.text((WIDTH // 2, 250), item["title"], fill=(255, 255, 255, 255), font=font_title, anchor="mm")
    # Subtitle
    draw.text((WIDTH // 2, 335), item["subtitle"], fill=(150, 150, 160, 255), font=font_sub, anchor="mm")

    # 3. Phone Bezel & Screen
    # Scaled down to fit nicely with bezel: phone width = 1060 px, height = 2300 px
    phone_w = 1040
    phone_h = 2254
    phone_x = (WIDTH - phone_w) // 2
    phone_y = 440
    corner_radius = 80

    # Phone chassis shadow
    shadow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle(
        [phone_x - 12, phone_y - 8, phone_x + phone_w + 12, phone_y + phone_h + 16],
        radius=corner_radius + 12,
        fill=(0, 0, 0, 140)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    canvas = Image.alpha_composite(canvas, shadow)

    # Phone chassis titanium outer border
    c_draw = ImageDraw.Draw(canvas)
    c_draw.rounded_rectangle(
        [phone_x - 10, phone_y - 10, phone_x + phone_w + 10, phone_y + phone_h + 10],
        radius=corner_radius + 8,
        fill=(40, 40, 44, 255),
        outline=(85, 85, 95, 255),
        width=4
    )

    # Inner bezel
    c_draw.rounded_rectangle(
        [phone_x - 4, phone_y - 4, phone_x + phone_w + 4, phone_y + phone_h + 4],
        radius=corner_radius + 4,
        fill=(12, 12, 14, 255)
    )

    # Load and resize screenshot to fit inner screen
    raw_screen = Image.open(item["src"]).convert("RGBA")
    screen_fitted = raw_screen.resize((phone_w, phone_h), Image.Resampling.LANCZOS)

    # Rounded mask for screen corners
    mask = Image.new("L", (phone_w, phone_h), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle([0, 0, phone_w, phone_h], radius=corner_radius, fill=255)

    canvas.paste(screen_fitted, (phone_x, phone_y), mask)

    # Dynamic Island overlay on top of screen
    di_w = 260
    di_h = 68
    di_x = WIDTH // 2 - di_w // 2
    di_y = phone_y + 24
    d_draw = ImageDraw.Draw(canvas)
    d_draw.rounded_rectangle([di_x, di_y, di_x + di_w, di_y + di_h], radius=34, fill=(0, 0, 0, 255))

    # Save final high-res image
    final_rgb = canvas.convert("RGB")
    final_rgb.save(item["out"], "PNG", quality=98)
    print(f"Generated: {item['out']} ({WIDTH}x{HEIGHT})")

print("All App Store graphics generated successfully!")
