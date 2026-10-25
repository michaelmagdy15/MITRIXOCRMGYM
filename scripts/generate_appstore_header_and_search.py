import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

out_dir = r"mobile/screenshots"
os.makedirs(out_dir, exist_ok=True)

facility_path = r"docs/inzan_manual_assets/website_facility.jpg"
logo_path = r"public/inzan-favicon.png"
screen_home_path = os.path.join(out_dir, "01_inzan_home_pass.png")
screen_classes_path = os.path.join(out_dir, "02_inzan_bookings_schedule.png")

def get_font(size, bold=False):
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

# ─────────────────────────────────────────────────────────────
# 1. HEADER ASSET: 3840 x 1646 px
# ─────────────────────────────────────────────────────────────
W_HEAD, H_HEAD = 3840, 1646
canvas_head = Image.new("RGBA", (W_HEAD, H_HEAD), (10, 10, 12, 255))

if os.path.exists(facility_path):
    fac = Image.open(facility_path).convert("RGBA")
    # Scale to cover width
    fac_w = W_HEAD
    fac_h = int(fac.height * (W_HEAD / fac.width))
    fac_scaled = fac.resize((fac_w, fac_h), Image.Resampling.LANCZOS)
    
    # Crop to header height
    crop_top = (fac_h - H_HEAD) // 2
    fac_cropped = fac_scaled.crop((0, crop_top, W_HEAD, crop_top + H_HEAD))
    
    # Dark atmospheric overlay
    dark_overlay = Image.new("RGBA", (W_HEAD, H_HEAD), (5, 5, 8, 200))
    # Gradient overlay: darker on left and right
    grad = Image.new("RGBA", (W_HEAD, H_HEAD), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(grad)
    for x in range(W_HEAD):
        # Darker on sides, slightly open in center
        factor = abs(x - W_HEAD // 2) / (W_HEAD // 2)
        alpha = int(120 + factor * 120)
        g_draw.line([(x, 0), (x, H_HEAD)], fill=(5, 5, 8, min(255, alpha)))
    
    canvas_head.paste(fac_cropped, (0, 0))
    canvas_head = Image.alpha_composite(canvas_head, dark_overlay)
    canvas_head = Image.alpha_composite(canvas_head, grad)

# Add Luxury Lighting Glow
glow_head = Image.new("RGBA", (W_HEAD, H_HEAD), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow_head)
for r in range(600, 0, -30):
    alpha = int((1 - r / 600.0) * 50)
    glow_draw.ellipse([800 - r * 2, 800 - r, 800 + r * 2, 800 + r], fill=(255, 255, 255, alpha))
canvas_head = Image.alpha_composite(canvas_head, glow_head)

# Paste Inzan Logo Badge
if os.path.exists(logo_path):
    logo = Image.open(logo_path).convert("RGBA").resize((380, 380), Image.Resampling.LANCZOS)
    # Add rounded border & shadow to logo
    canvas_head.paste(logo, (320, 380), logo)

draw_head = ImageDraw.Draw(canvas_head)
font_h_tag = get_font(42, bold=True)
font_h_title = get_font(120, bold=True)
font_h_sub = get_font(52, bold=False)

draw_head.text((320, 830), "OFFICIAL ATHLETIC CLUB APP", fill=(170, 170, 185, 255), font=font_h_tag)
draw_head.text((320, 930), "INZAN ATHLETICS", fill=(255, 255, 255, 255), font=font_h_title)
draw_head.text((320, 1080), "High-Performance Training • Class Reservations • Smart Locker Key", fill=(200, 200, 215, 255), font=font_h_sub)

# Right side: Add Phone Mockup inside Header
if os.path.exists(screen_home_path):
    phone_h = 1350
    phone_w = int(1040 * (phone_h / 2254))
    raw_s = Image.open(screen_home_path).convert("RGBA")
    s_resized = raw_s.resize((phone_w, phone_h), Image.Resampling.LANCZOS)
    
    # Chassis
    chassis_x = W_HEAD - phone_w - 380
    chassis_y = 150
    
    # Shadow
    p_shadow = Image.new("RGBA", (W_HEAD, H_HEAD), (0, 0, 0, 0))
    ps_draw = ImageDraw.Draw(p_shadow)
    ps_draw.rounded_rectangle([chassis_x - 15, chassis_y - 10, chassis_x + phone_w + 15, chassis_y + phone_h + 15], radius=60, fill=(0, 0, 0, 160))
    p_shadow = p_shadow.filter(ImageFilter.GaussianBlur(35))
    canvas_head = Image.alpha_composite(canvas_head, p_shadow)
    
    # Paste Screen
    mask_phone = Image.new("L", (phone_w, phone_h), 0)
    mp_draw = ImageDraw.Draw(mask_phone)
    mp_draw.rounded_rectangle([0, 0, phone_w, phone_h], radius=48, fill=255)
    canvas_head.paste(s_resized, (chassis_x, chassis_y), mask_phone)
    
    # Titanium border
    d_ch = ImageDraw.Draw(canvas_head)
    d_ch.rounded_rectangle([chassis_x - 6, chassis_y - 6, chassis_x + phone_w + 6, chassis_y + phone_h + 6], radius=52, outline=(90, 90, 100, 255), width=4)

header_out = os.path.join(out_dir, "appstore_header_3840x1646.png")
canvas_head.convert("RGB").save(header_out, "PNG", quality=98)
print(f"Generated Header: {header_out} ({W_HEAD}x{H_HEAD})")


# ─────────────────────────────────────────────────────────────
# 2. SEARCH RESULTS ASSET: 1920 x 1280 px
# ─────────────────────────────────────────────────────────────
W_SR, H_SR = 1920, 1280
canvas_sr = Image.new("RGBA", (W_SR, H_SR), (10, 10, 12, 255))

if os.path.exists(facility_path):
    fac = Image.open(facility_path).convert("RGBA")
    fac_scaled = fac.resize((W_SR, int(fac.height * (W_SR / fac.width))), Image.Resampling.LANCZOS)
    crop_top = (fac_scaled.height - H_SR) // 2
    fac_cropped = fac_scaled.crop((0, crop_top, W_SR, crop_top + H_SR))
    
    dark_overlay = Image.new("RGBA", (W_SR, H_SR), (6, 6, 9, 215))
    canvas_sr.paste(fac_cropped, (0, 0))
    canvas_sr = Image.alpha_composite(canvas_sr, dark_overlay)

# Add Inzan Logo
if os.path.exists(logo_path):
    logo_sr = Image.open(logo_path).convert("RGBA").resize((260, 260), Image.Resampling.LANCZOS)
    canvas_sr.paste(logo_sr, (160, 280), logo_sr)

draw_sr = ImageDraw.Draw(canvas_sr)
font_sr_tag = get_font(30, bold=True)
font_sr_title = get_font(84, bold=True)
font_sr_sub = get_font(36, bold=False)

draw_sr.text((160, 600), "INZAN ATHLETICS", fill=(170, 170, 185, 255), font=font_sr_tag)
draw_sr.text((160, 680), "TRAIN WITHOUT\nLIMITS", fill=(255, 255, 255, 255), font=font_sr_title)
draw_sr.text((160, 910), "Reserve classes, unlock smart lockers & track\nall workout sessions directly from your phone.", fill=(200, 200, 215, 255), font=font_sr_sub)

# Right side: Add Phone Mockup in Search Result
if os.path.exists(screen_home_path):
    p_h = 1080
    p_w = int(1040 * (p_h / 2254))
    raw_s = Image.open(screen_home_path).convert("RGBA")
    s_resized = raw_s.resize((p_w, p_h), Image.Resampling.LANCZOS)
    
    c_x = W_SR - p_w - 180
    c_y = 100
    
    p_shadow = Image.new("RGBA", (W_SR, H_SR), (0, 0, 0, 0))
    ps_draw = ImageDraw.Draw(p_shadow)
    ps_draw.rounded_rectangle([c_x - 12, c_y - 8, c_x + p_w + 12, c_y + p_h + 12], radius=48, fill=(0, 0, 0, 160))
    p_shadow = p_shadow.filter(ImageFilter.GaussianBlur(28))
    canvas_sr = Image.alpha_composite(canvas_sr, p_shadow)
    
    mask_phone = Image.new("L", (p_w, p_h), 0)
    mp_draw = ImageDraw.Draw(mask_phone)
    mp_draw.rounded_rectangle([0, 0, p_w, p_h], radius=40, fill=255)
    canvas_sr.paste(s_resized, (c_x, c_y), mask_phone)
    
    d_ch = ImageDraw.Draw(canvas_sr)
    d_ch.rounded_rectangle([c_x - 4, c_y - 4, c_x + p_w + 4, c_y + p_h + 4], radius=44, outline=(85, 85, 95, 255), width=3)

sr_out = os.path.join(out_dir, "appstore_search_results_1920x1280.png")
canvas_sr.convert("RGB").save(sr_out, "PNG", quality=98)
print(f"Generated Search Results: {sr_out} ({W_SR}x{H_SR})")

print("Header and Search Results assets generated successfully!")
