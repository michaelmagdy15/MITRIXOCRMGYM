import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        
        print("Navigating to dashboard...")
        await page.goto("http://localhost:5175/dashboard")
        
        # Try logging in
        try:
            print("Checking for login form...")
            await page.wait_for_selector("input[type='email']", timeout=5000)
            await page.fill("input[type='email']", "michaelmitry13@gmail.com")
            await page.fill("input[type='password']", "qAyI,S4r<646")
            await page.click("button[type='submit']")
            print("Logged in!")
            await page.wait_for_timeout(4000)
        except Exception as e:
            print("No login form detected or already logged in.")
        
        # 1. Dashboard
        print("Capturing Dashboard...")
        await page.goto("http://localhost:5175/dashboard")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=r"C:\Users\Mi5a\.gemini\antigravity\brain\f708ca9c-1b1a-4c4f-bd4d-753117694c91\dashboard.png")
        
        # 2. Clients
        print("Capturing Clients...")
        await page.goto("http://localhost:5175/members")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=r"C:\Users\Mi5a\.gemini\antigravity\brain\f708ca9c-1b1a-4c4f-bd4d-753117694c91\clients.png")
        
        # 3. Payments
        print("Capturing Payments...")
        await page.goto("http://localhost:5175/payments")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=r"C:\Users\Mi5a\.gemini\antigravity\brain\f708ca9c-1b1a-4c4f-bd4d-753117694c91\payments.png")
        
        # 4. Attendance
        print("Capturing Attendance...")
        await page.goto("http://localhost:5175/attendance")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=r"C:\Users\Mi5a\.gemini\antigravity\brain\f708ca9c-1b1a-4c4f-bd4d-753117694c91\attendance.png")
        
        await browser.close()
        print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
