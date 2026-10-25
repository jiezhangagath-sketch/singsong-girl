"""跋文云幕验证截图：桌面（转场中段+完全显现）与移动端。
用法：python3 outputs/云朵草稿/shot_postscript.py [端口]
"""
import asyncio
import sys
from playwright.async_api import async_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else "8090"
BASE = f"http://localhost:{PORT}/index.html"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome")
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(BASE)
        await page.wait_for_function(
            "typeof storyData !== 'undefined' && storyData !== null", timeout=10000
        )
        await page.evaluate("currentSceneId = 'xh_postscript'; renderScene();")
        await page.wait_for_timeout(1200)
        await page.screenshot(path="/tmp/ps_mid.png")
        await page.wait_for_timeout(4000)
        await page.screenshot(path="/tmp/ps_full.png")
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(600)
        await page.screenshot(path="/tmp/ps_mobile.png")
        await browser.close()
        print("screenshots done")

asyncio.run(main())
