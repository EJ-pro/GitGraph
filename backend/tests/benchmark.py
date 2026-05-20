import asyncio
import time
import argparse
import numpy as np
import httpx
from datetime import timedelta
import sys
import os

# Add backend directory to path so we can import models and auth
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.database import SessionLocal
from database.models import User, ChatSession
from api.auth import create_access_token

async def run_scenario(client: httpx.AsyncClient, name: str, url: str, headers: dict, num_requests: int, concurrency: int):
    print(f"\n🚀 Running Scenario: {name} (Requests: {num_requests}, Concurrency: {concurrency})")
    
    sem = asyncio.Semaphore(concurrency)
    latencies = []
    success_count = 0
    failure_count = 0
    
    async def make_request():
        nonlocal success_count, failure_count
        async with sem:
            start_time = time.perf_counter()
            try:
                response = await client.get(url, headers=headers, timeout=30.0)
                duration = (time.perf_counter() - start_time) * 1000.0 # ms
                if response.status_code >= 200 and response.status_code < 300:
                    success_count += 1
                    latencies.append(duration)
                else:
                    failure_count += 1
                    print(f"Error [{response.status_code}]: {response.text[:100]}")
            except Exception as e:
                failure_count += 1
                print(f"Request Exception: {str(e)[:100]}")

    start_total = time.perf_counter()
    tasks = [asyncio.create_task(make_request()) for _ in range(num_requests)]
    await asyncio.gather(*tasks)
    total_time = time.perf_counter() - start_total
    
    if not latencies:
        print("❌ All requests failed.")
        return
        
    latencies = sorted(latencies)
    rps = num_requests / total_time
    
    print(f"📊 Results for {name}:")
    print(f"  - Total Time: {total_time:.2f} seconds")
    print(f"  - Requests/sec: {rps:.2f}")
    print(f"  - Success: {success_count} | Failures: {failure_count}")
    print(f"  - Latency Stats:")
    print(f"    - Min:  {min(latencies):.1f} ms")
    print(f"    - Mean: {np.mean(latencies):.1f} ms")
    print(f"    - p50:  {np.percentile(latencies, 50):.1f} ms")
    print(f"    - p90:  {np.percentile(latencies, 90):.1f} ms")
    print(f"    - p99:  {np.percentile(latencies, 99):.1f} ms")
    print(f"    - Max:  {max(latencies):.1f} ms")

def setup_auth():
    """Fetches user and generates JWT token."""
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            print("Creating temporary benchmark user...")
            user = User(
                email="benchmark@test.com",
                name="Benchmark User",
                provider="local",
                github_username="benchmark_test"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        
        # Generate token
        token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(hours=2)
        )
        
        # Try to find a valid session id for obsidian vault test
        session = db.query(ChatSession).first()
        session_id = session.id if session else None
        
        return token, session_id
    finally:
        db.close()

async def main():
    parser = argparse.ArgumentParser(description="FastAPI Benchmark tool")
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL of the server")
    parser.add_argument("--concurrency", type=int, default=10, help="Number of concurrent requests")
    parser.add_argument("--requests", type=int, default=100, help="Total requests per endpoint")
    args = parser.parse_args()

    print("🔑 Authenticating and setting up token...")
    try:
        token, session_id = setup_auth()
    except Exception as e:
        print(f"Error during auth setup: {e}")
        sys.exit(1)
        
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    scenarios = [
        ("Auth Verification (/auth/me)", f"{args.url}/auth/me"),
        ("Project Directory (/projects)", f"{args.url}/projects"),
        ("Global Dashboard Stats (/stats/global)", f"{args.url}/stats/global")
    ]
    
    if session_id:
        scenarios.append(
            ("Obsidian Vault Stream (/generate/obsidian-vault)", f"{args.url}/generate/obsidian-vault?session_id={session_id}")
        )
    else:
        print("⚠️ No chat session found in DB. Skipping Obsidian Vault test.")
        
    limits = httpx.Limits(max_keepalive_connections=args.concurrency, max_connections=args.concurrency * 2)
    async with httpx.AsyncClient(limits=limits) as client:
        for name, url in scenarios:
            await run_scenario(client, name, url, headers, args.requests, args.concurrency)

if __name__ == "__main__":
    # Ensure event loop policy or compatibility on windows
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
