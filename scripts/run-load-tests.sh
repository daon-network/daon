#!/bin/bash
#
# DAON Load Test Runner
# Orchestrates k6 load tests against the remote server with automated
# rate limit toggling.
#
# Usage:
#   ./scripts/run-load-tests.sh
#   DAON_SERVER=myalias ./scripts/run-load-tests.sh
#

DAON_SERVER="${DAON_SERVER:-daon}"
API_URL="https://api.daon.network"
RESULTS_FILE="load-results-$(date +%Y%m%d-%H%M).json"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  DAON Load Test Runner                 ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
echo -e "  Server: ${DAON_SERVER}  API: ${API_URL}"
echo ""

# Ensure k6 is installed
if ! command -v k6 &>/dev/null; then
    echo -e "${RED}✗ k6 not found. Install with: brew install k6${NC}"
    exit 1
fi

# restart_api_containers MODE
# Stops, removes, and recreates all daon-api-* containers with LOAD_TEST_MODE=$MODE.
# Reads the full config from docker inspect so no hardcoded values are needed.
restart_api_containers() {
    local MODE="$1"
    ssh "${DAON_SERVER}" "python3 -c \"
import subprocess, json, sys

mode = '$MODE'
filter_prefixes = ('PATH=', 'NODE_', 'npm_', 'YARN_', 'LOAD_TEST_MODE=')

result = subprocess.run(
    ['docker', 'ps', '--format', '{{.Names}}', '--filter', 'name=daon-api-'],
    capture_output=True, text=True)
containers = [n.strip() for n in result.stdout.strip().split('\n') if n.strip()]

if not containers:
    print('  no daon-api-* containers found', file=sys.stderr)
    sys.exit(1)

for name in containers:
    raw = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True)
    info = json.loads(raw.stdout)[0]

    image   = info['Config']['Image']
    network = info['HostConfig']['NetworkMode']
    restart = info['HostConfig']['RestartPolicy']['Name'] or 'no'
    ports   = info['HostConfig']['PortBindings'] or {}
    binds   = info['HostConfig']['Binds'] or []
    env     = [e for e in info['Config']['Env']
               if not any(e.startswith(p) for p in filter_prefixes)]
    env.append(f'LOAD_TEST_MODE={mode}')

    args = ['docker', 'run', '-d',
            f'--name={name}', f'--network={network}', f'--restart={restart}']
    for cport, bindings in ports.items():
        for b in bindings:
            host = f\\\"{b['HostIp']}:{b['HostPort']}\\\" if b['HostIp'] else b['HostPort']
            args += ['-p', f'{host}:{cport}']
    for bind in binds:
        args += ['-v', bind]
    for e in env:
        args += ['-e', e]
    args.append(image)

    subprocess.run(['docker', 'stop', name], capture_output=True)
    subprocess.run(['docker', 'rm',   name], capture_output=True)
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode == 0:
        print(f'  started {name} (LOAD_TEST_MODE={mode})')
    else:
        print(f'  failed to start {name}: {r.stderr}', file=sys.stderr)
        sys.exit(1)
\""
}

# Cleanup: restore normal rate limits on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Restoring normal rate limits...${NC}"
    restart_api_containers "false" && \
        echo -e "${GREEN}Rate limits restored.${NC}" || \
        echo -e "${YELLOW}⚠  Could not auto-restore rate limits — check server manually${NC}"
}
trap cleanup EXIT

# Step 1: Pre-check server health
echo -e "${BLUE}[1/4]${NC} Pre-flight: verifying server health..."
HEALTH=$(curl -sf "${API_URL}/health" 2>/dev/null) || {
    echo -e "${RED}✗ Cannot reach ${API_URL}/health — aborting${NC}"
    exit 1
}
STATUS=$(echo "$HEALTH" | jq -r '.status // empty' 2>/dev/null)
echo -e "${GREEN}✓ Server healthy (status=${STATUS})${NC}"
echo ""

# Step 2: Enable LOAD_TEST_MODE on server
echo -e "${BLUE}[2/4]${NC} Enabling LOAD_TEST_MODE on server..."
restart_api_containers "true" || {
    echo -e "${YELLOW}⚠  Could not enable LOAD_TEST_MODE — rate limits may throttle results${NC}"
    echo -e "${YELLOW}   Proceeding anyway...${NC}"
}
echo ""

# Step 3: Wait for containers to stabilize
echo -e "${BLUE}[3/4]${NC} Waiting for containers to become healthy..."
for i in $(seq 1 12); do
    HEALTH2=$(curl -sf "${API_URL}/health" 2>/dev/null) && break
    sleep 5
done
if [ -z "$HEALTH2" ]; then
    echo -e "${RED}✗ Server not healthy after LOAD_TEST_MODE restart — aborting${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Server healthy after restart${NC}"
echo ""

# Step 4: Run k6 load test
echo -e "${BLUE}[4/4]${NC} Running k6 load test..."
echo -e "  Results: ${RESULTS_FILE}"
echo ""

k6 run \
    --env API_URL="${API_URL}" \
    --out "json=${RESULTS_FILE}" \
    load-tests/load-test.js
K6_EXIT=$?

echo ""

# Print threshold summary
if [ -f "$RESULTS_FILE" ]; then
    echo -e "${YELLOW}════════════════ Load Test Summary ════════════════${NC}"
    echo -e "  Results saved to: ${RESULTS_FILE}"
    echo -e "  To view metrics: cat ${RESULTS_FILE} | jq '.metrics.http_req_duration'"
    echo ""
fi

if [ $K6_EXIT -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  LOAD TEST PASSED — all thresholds met ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
else
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  LOAD TEST FAILED — thresholds not met ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
fi

exit $K6_EXIT
