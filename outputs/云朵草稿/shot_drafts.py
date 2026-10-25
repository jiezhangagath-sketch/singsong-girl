"""对云朵草稿逐块截图。用法：python3 shot_drafts.py [draftA draftB draftC]"""
import asyncio
import os
import sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
TARGETS = sys.argv[1:] or ["draftA", "draftB", "draftC"]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome")
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto("file://" + os.path.join(HERE, "drafts.html"))
        await page.wait_for_timeout(800)
        for name in TARGETS:
            el = await page.query_selector(f"#{name}")
            await el.screenshot(path=os.path.join(HERE, f"{name}.png"))
        await browser.close()
        print("captured:", TARGETS)

asyncio.run(main())
