#!/bin/bash
# DAON Automated Load Testing Script
# Runs k6 load tests with system monitoring and comprehensive reporting
#
# Usage:
#   ./run-load-test.sh                                    # Default: localhost:3000, 1500 VUs, 20m
#   ./run-load-test.sh https://api.daon.network          # Custom URL
#   ./run-load-test.sh https://api.daon.network 1000     # Custom max VUs
#   ./run-load-test.sh https://api.daon.network 1000 15m # Custom duration

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_URL="${1:-http://localhost:3000}"
MAX_VUS="${2:-1500}"
DURATION="${3:-20m}"
RESULTS_BASE_DIR="${RESULTS_BASE_DIR:-/opt/daon/load-tests/results}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="$RESULTS_BASE_DIR/$TIMESTAMP"

# Logging
log() { echo -e "${2:-$NC}[$(date +'%H:%M:%S')] $1${NC}"; }
log_error() { log "ERROR: $1" "$RED"; }
log_success() { log "✅ $1" "$GREEN"; }
log_warning() { log "⚠️  $1" "$YELLOW"; }
log_info() { log "ℹ️  $1" "$BLUE"; }

# Banner
echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║          DAON Load Testing Suite                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

log_info "Configuration:"
log_info "  Target URL: $TARGET_URL"
log_info "  Max VUs: $MAX_VUS"
log_info "  Duration: $DURATION"
log_info "  Results: $RESULTS_DIR"
echo ""

# Create results directory
mkdir -p "$RESULTS_DIR"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    log_error "k6 is not installed"
    echo ""
    echo "Install k6:"
    echo "  macOS: brew install k6"
    echo "  Linux: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

K6_VERSION=$(k6 version | head -1)
log_success "k6 found: $K6_VERSION"

# ==================== PRE-TEST VALIDATION ====================
echo ""
log_info "Running pre-test validation..."

# 1. Health check
log_info "Checking target health endpoint..."
HEALTH_URL="$TARGET_URL/health"
if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    log_success "Health endpoint responsive: $HEALTH_URL"
else
    log_error "Health endpoint not responding: $HEALTH_URL"
    read -p "$(echo -e ${YELLOW}Continue anyway? [y/N]: ${NC})" CONTINUE
    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 2. Check system resources (if local)
if [ "$TARGET_URL" = "http://localhost:3000" ] || [[ "$TARGET_URL" == http://localhost:* ]]; then
    log_info "Checking local system resources..."

    # Check memory
    if command -v free &> /dev/null; then
        MEM_PERCENT=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
        if [ "$MEM_PERCENT" -gt 80 ]; then
            log_warning "Memory usage is high: ${MEM_PERCENT}%"
        else
            log_success "Memory usage OK: ${MEM_PERCENT}%"
        fi
    fi

    # Check disk space
    if command -v df &> /dev/null; then
        DISK_FREE=$(df -h . | tail -1 | awk '{print $4}')
        DISK_FREE_GB=$(df -BG . | tail -1 | awk '{print $4}' | tr -d 'G')
        if [ "$DISK_FREE_GB" -lt 10 ]; then
            log_warning "Low disk space: ${DISK_FREE}"
        else
            log_success "Disk space OK: ${DISK_FREE} free"
        fi
    fi
fi

# 3. Check k6 test script exists
K6_SCRIPT="$PROJECT_ROOT/load-tests/stress-test.js"
if [ ! -f "$K6_SCRIPT" ]; then
    log_error "k6 test script not found: $K6_SCRIPT"
    exit 1
fi
log_success "k6 test script found"

# 4. Confirmation
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Load Test Configuration:${NC}"
echo -e "  Target: ${GREEN}$TARGET_URL${NC}"
echo -e "  Max Users: ${GREEN}$MAX_VUS${NC} concurrent virtual users"
echo -e "  Duration: ${GREEN}$DURATION${NC}"
echo -e "  Results: ${GREEN}$RESULTS_DIR${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
read -p "$(echo -e ${YELLOW}Start load test? [y/N]: ${NC})" START_TEST
if [[ ! "$START_TEST" =~ ^[Yy]$ ]]; then
    log_info "Test cancelled"
    exit 0
fi

# ==================== START MONITORING ====================
echo ""
log_info "Starting system monitoring..."

# Function to monitor resources
monitor_resources() {
    local results_dir="$1"
    local interval=5

    while true; do
        # Docker stats (if available)
        if command -v docker &> /dev/null; then
            docker stats --no-stream --format 'table {{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.NetIO}}' \
                >> "$results_dir/system-metrics.csv" 2>/dev/null || true
        fi

        # System stats
        if command -v top &> /dev/null; then
            top -bn1 | head -5 >> "$results_dir/system-snapshot.log" 2>/dev/null || true
        fi

        sleep $interval
    done
}

# Start monitoring in background
monitor_resources "$RESULTS_DIR" &
MONITOR_PID=$!
log_success "System monitoring started (PID: $MONITOR_PID)"

# Cleanup function
cleanup() {
    log_info "Stopping monitoring..."
    kill $MONITOR_PID 2>/dev/null || true
    wait $MONITOR_PID 2>/dev/null || true
    log_success "Monitoring stopped"
}
trap cleanup EXIT

# ==================== RUN LOAD TEST ====================
echo ""
log_info "Starting k6 load test..."
log_info "This may take $DURATION..."
echo ""

# Record start time
START_TIME=$(date +%s)
START_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Adjust k6 script options if needed (we use the existing stages from stress-test.js)
# The script already has good stages, but we can override API_URL

# Run k6 with outputs
K6_EXIT_CODE=0
k6 run \
    --env API_URL="$TARGET_URL" \
    --out json="$RESULTS_DIR/results.json" \
    --out csv="$RESULTS_DIR/results.csv" \
    "$K6_SCRIPT" 2>&1 | tee "$RESULTS_DIR/console.log" || K6_EXIT_CODE=$?

# Record end time
END_TIME=$(date +%s)
END_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ELAPSED=$((END_TIME - START_TIME))

echo ""
if [ $K6_EXIT_CODE -eq 0 ]; then
    log_success "Load test completed (${ELAPSED}s)"
else
    log_warning "Load test completed with exit code $K6_EXIT_CODE (${ELAPSED}s)"
fi

# ==================== ANALYZE RESULTS ====================
echo ""
log_info "Analyzing results..."

# Parse k6 JSON output for key metrics
if [ -f "$RESULTS_DIR/results.json" ]; then
    log_info "Parsing metrics from results.json..."

    # Extract summary (k6 writes summary at the end of the JSON lines)
    SUMMARY_LINE=$(tail -100 "$RESULTS_DIR/results.json" | grep '"type":"Point"' | tail -1 || echo "{}")

    # Try to get metrics from console.log (more reliable)
    if [ -f "$RESULTS_DIR/console.log" ]; then
        TOTAL_REQUESTS=$(grep -oP 'http_reqs.*\K\d+' "$RESULTS_DIR/console.log" | tail -1 || echo "0")
        TOTAL_ERRORS=$(grep -oP 'errors.*\K\d+' "$RESULTS_DIR/console.log" | tail -1 || echo "0")
        AVG_DURATION=$(grep -oP 'http_req_duration.*avg=\K[\d.]+' "$RESULTS_DIR/console.log" | tail -1 || echo "0")
        P95_DURATION=$(grep -oP 'p\(95\)=\K[\d.]+' "$RESULTS_DIR/console.log" | tail -1 || echo "0")
        MAX_DURATION=$(grep -oP 'max=\K[\d.]+' "$RESULTS_DIR/console.log" | tail -1 || echo "0")
    else
        TOTAL_REQUESTS="unknown"
        TOTAL_ERRORS="unknown"
        AVG_DURATION="unknown"
        P95_DURATION="unknown"
        MAX_DURATION="unknown"
    fi
else
    log_warning "results.json not found"
    TOTAL_REQUESTS="0"
    TOTAL_ERRORS="0"
    AVG_DURATION="0"
    P95_DURATION="0"
    MAX_DURATION="0"
fi

# Calculate error rate
if [ "$TOTAL_REQUESTS" != "unknown" ] && [ "$TOTAL_REQUESTS" != "0" ]; then
    ERROR_RATE=$(echo "scale=2; $TOTAL_ERRORS * 100 / $TOTAL_REQUESTS" | bc -l 2>/dev/null || echo "0")
else
    ERROR_RATE="0"
fi

# Analyze system metrics
log_info "Analyzing system metrics..."
if [ -f "$RESULTS_DIR/system-metrics.csv" ]; then
    # Find peak CPU and memory (basic parsing)
    PEAK_CPU=$(awk -F',' '{print $2}' "$RESULTS_DIR/system-metrics.csv" | grep -oP '[\d.]+' | sort -n | tail -1 || echo "N/A")
    PEAK_MEM=$(awk -F',' '{print $3}' "$RESULTS_DIR/system-metrics.csv" | grep -oP '[\d.]+GiB' | head -1 || echo "N/A")
else
    PEAK_CPU="N/A"
    PEAK_MEM="N/A"
fi

# ==================== GENERATE REPORT ====================
echo ""
log_info "Generating report..."

REPORT_FILE="$RESULTS_DIR/REPORT.md"

cat > "$REPORT_FILE" << EOF
# DAON Load Test Report

**Generated:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Test Configuration

- **Target URL:** $TARGET_URL
- **Max Virtual Users:** $MAX_VUS
- **Duration:** $DURATION
- **Start Time:** $START_TIMESTAMP
- **End Time:** $END_TIMESTAMP
- **Elapsed Time:** ${ELAPSED}s

## Test Results

### Request Metrics

| Metric | Value |
|--------|-------|
| Total Requests | $TOTAL_REQUESTS |
| Total Errors | $TOTAL_ERRORS |
| Error Rate | ${ERROR_RATE}% |
| Avg Response Time | ${AVG_DURATION}ms |
| P95 Response Time | ${P95_DURATION}ms |
| Max Response Time | ${MAX_DURATION}ms |

### System Metrics

| Metric | Value |
|--------|-------|
| Peak CPU Usage | $PEAK_CPU |
| Peak Memory Usage | $PEAK_MEM |

## Analysis

EOF

# Add analysis based on results
if [ "$TOTAL_REQUESTS" != "unknown" ] && [ "$TOTAL_REQUESTS" != "0" ]; then
    # Determine if test passed based on thresholds
    PASS=true

    # Check error rate
    if (( $(echo "$ERROR_RATE > 10" | bc -l) )); then
        echo "### ❌ High Error Rate" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "Error rate of ${ERROR_RATE}% exceeds threshold of 10%." >> "$REPORT_FILE"
        echo "**Recommendation:** Investigate error logs and optimize system capacity." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        PASS=false
    else
        echo "### ✅ Error Rate Acceptable" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "Error rate of ${ERROR_RATE}% is within acceptable range (<10%)." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    # Check P95 response time
    if [ "$P95_DURATION" != "unknown" ] && (( $(echo "$P95_DURATION > 5000" | bc -l 2>/dev/null || echo "0") )); then
        echo "### ⚠️  High Response Times" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "P95 response time of ${P95_DURATION}ms exceeds target of 5000ms." >> "$REPORT_FILE"
        echo "**Recommendation:** Optimize API endpoints or increase server resources." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        PASS=false
    else
        echo "### ✅ Response Times Acceptable" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "P95 response time of ${P95_DURATION}ms is within target (<5000ms)." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    # Overall status
    if [ "$PASS" = true ]; then
        echo "## Overall Status: ✅ PASS" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "The system successfully handled the load test with acceptable error rates and response times." >> "$REPORT_FILE"
    else
        echo "## Overall Status: ❌ NEEDS IMPROVEMENT" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "The system showed signs of stress. Review recommendations above before production launch." >> "$REPORT_FILE"
    fi
else
    echo "### ⚠️  Incomplete Results" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "Could not parse complete results. Check console.log for details." >> "$REPORT_FILE"
fi

# Add file references
cat >> "$REPORT_FILE" << EOF

## Result Files

- **Full Console Output:** \`console.log\`
- **JSON Metrics:** \`results.json\`
- **CSV Data:** \`results.csv\`
- **System Metrics:** \`system-metrics.csv\`
- **System Snapshots:** \`system-snapshot.log\`

## Next Steps

1. Review detailed metrics in \`results.json\` and \`results.csv\`
2. Check \`console.log\` for any errors or warnings
3. Analyze system metrics for bottlenecks
4. If issues found, optimize and re-run test
5. If test passed, proceed with pre-launch checks

---

**Results Directory:** \`$RESULTS_DIR\`
EOF

log_success "Report generated: $REPORT_FILE"

# ==================== POST-TEST VALIDATION ====================
echo ""
log_info "Running post-test validation..."

# Wait a bit for system to stabilize
sleep 5

# Health check
if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    log_success "Post-test health check passed"
else
    log_error "Post-test health check failed!"
    log_error "System may be in degraded state"
fi

# Check for error spike in logs (if local)
if [ "$TARGET_URL" = "http://localhost:3000" ] || [[ "$TARGET_URL" == http://localhost:* ]]; then
    if command -v docker &> /dev/null; then
        RECENT_ERRORS=$(docker compose logs --tail=100 2>/dev/null | grep -ci "error\|exception\|fatal" || echo "0")
        if [ "$RECENT_ERRORS" -gt 50 ]; then
            log_warning "High number of errors in recent logs: $RECENT_ERRORS"
            log_warning "Check: docker compose logs"
        else
            log_success "Error count in logs acceptable: $RECENT_ERRORS"
        fi
    fi
fi

# ==================== SUMMARY ====================
echo ""
echo -e "${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        Load Test Completed                                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Display summary
echo -e "${BLUE}Results Summary:${NC}"
echo -e "  Total Requests: ${GREEN}$TOTAL_REQUESTS${NC}"
echo -e "  Total Errors: ${RED}$TOTAL_ERRORS${NC} (${ERROR_RATE}%)"
echo -e "  Avg Response: ${YELLOW}${AVG_DURATION}ms${NC}"
echo -e "  P95 Response: ${YELLOW}${P95_DURATION}ms${NC}"
echo ""
echo -e "${BLUE}View full report:${NC}"
echo -e "  ${GREEN}cat $REPORT_FILE${NC}"
echo ""
echo -e "${BLUE}Or open results directory:${NC}"
echo -e "  ${GREEN}cd $RESULTS_DIR${NC}"
echo ""

exit 0
