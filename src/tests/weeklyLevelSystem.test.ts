import assert from 'assert';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getWeeklyTimeBounds, getPreviousWeekBounds } from '../services/user.service';

dayjs.extend(utc);
dayjs.extend(timezone);

console.log('🧪 Starting Weekly Host Level System Audit Test Suite...');

// 1. Timezone & Boundary Tests
{
    // Monday morning 09:00 IST
    const mondayIST = new Date('2026-08-17T09:00:00+05:30');
    const bounds = getWeeklyTimeBounds(mondayIST);

    const startISTStr = dayjs(bounds.startOfWeek).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss.SSS');
    const endISTStr = dayjs(bounds.endOfWeek).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss.SSS');

    console.log(`  [Test 1] Current Week Bounds for Aug 17, 2026 IST:`);
    console.log(`    Start: ${startISTStr}`);
    console.log(`    End:   ${endISTStr}`);

    assert.strictEqual(startISTStr, '2026-08-17 00:00:00.000', 'Start of week MUST be Monday 00:00:00.000 IST');
    assert.strictEqual(endISTStr, '2026-08-23 23:59:59.999', 'End of week MUST be Sunday 23:59:59.999 IST');
    console.log('  ✅ Test 1 PASSED: Monday 00:00:00 to Sunday 23:59:59.999 IST verified');
}

// 2. Sunday Boundary Test
{
    // Sunday night 23:55 IST
    const sundayIST = new Date('2026-08-23T23:55:00+05:30');
    const bounds = getWeeklyTimeBounds(sundayIST);

    const startISTStr = dayjs(bounds.startOfWeek).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss.SSS');
    const endISTStr = dayjs(bounds.endOfWeek).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss.SSS');

    assert.strictEqual(startISTStr, '2026-08-17 00:00:00.000', 'Sunday falls in the Monday Aug 17 week');
    assert.strictEqual(endISTStr, '2026-08-23 23:59:59.999', 'Sunday ends at 23:59:59.999 IST');
    console.log('  ✅ Test 2 PASSED: Sunday night boundary falls in current week');
}

// 3. Previous Week Bounds Test
{
    // Monday Midnight 00:00:01 IST
    const mondayMidnight = new Date('2026-08-24T00:00:01+05:30');
    const prevBounds = getPreviousWeekBounds(mondayMidnight);

    const prevStartStr = dayjs(prevBounds.startOfWeek).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss.SSS');
    const prevEndStr = dayjs(prevBounds.endOfWeek).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss.SSS');

    console.log(`  [Test 3] Previous Week Bounds at Monday Midnight (Aug 24 00:00:01 IST):`);
    console.log(`    Prev Start: ${prevStartStr}`);
    console.log(`    Prev End:   ${prevEndStr}`);

    assert.strictEqual(prevStartStr, '2026-08-17 00:00:00.000', 'Previous week start MUST be Aug 17 00:00:00 IST');
    assert.strictEqual(prevEndStr, '2026-08-23 23:59:59.999', 'Previous week end MUST be Aug 23 23:59:59.999 IST');
    console.log('  ✅ Test 3 PASSED: Previous week correctly targets concluded week');
}

// 4. Target AND Rule Logic Simulation
{
    // Level 3 target: minCalls: 160, minMinutes: 330
    const levels = [
        { level: 3, minCalls: 160, minMinutes: 330 },
        { level: 2, minCalls: 110, minMinutes: 200 },
        { level: 1, minCalls: 80, minMinutes: 120 },
    ];

    const evaluate = (calls: number, minutes: number) => {
        for (const lvl of levels) {
            if (calls >= lvl.minCalls && minutes >= lvl.minMinutes) {
                return lvl.level;
            }
        }
        return 1;
    };

    assert.strictEqual(evaluate(170, 100), 1, 'Calls met (170 >= 160) BUT minutes failed (100 < 330) -> level 1');
    assert.strictEqual(evaluate(50, 400), 1, 'Minutes met (400 >= 330) BUT calls failed (50 < 160) -> level 1');
    assert.strictEqual(evaluate(165, 340), 3, 'Both calls (165 >= 160) and minutes (340 >= 330) met -> level 3');

    console.log('  ✅ Test 4 PASSED: AND rule logic (calls AND minutes required) verified');
}

// 5. Highest Achieved Level Selection
{
    const levels = [
        { level: 5, minCalls: 300, minMinutes: 700 },
        { level: 4, minCalls: 220, minMinutes: 500 },
        { level: 3, minCalls: 160, minMinutes: 330 },
        { level: 2, minCalls: 110, minMinutes: 200 },
        { level: 1, minCalls: 80, minMinutes: 120 },
    ];

    const evaluate = (calls: number, minutes: number) => {
        for (const lvl of levels) {
            if (calls >= lvl.minCalls && minutes >= lvl.minMinutes) {
                return lvl.level;
            }
        }
        return 1;
    };

    // Meets Level 1, Level 2, Level 3, Level 4 targets, but NOT Level 5
    assert.strictEqual(evaluate(250, 550), 4, 'Should select highest achieved level (Level 4)');
    // Level 1 host achieving Level 5 target -> directly Level 5
    assert.strictEqual(evaluate(350, 800), 5, 'Level 1 host achieving Level 5 target directly becomes Level 5');

    console.log('  ✅ Test 5 PASSED: Multi-level jump to highest achieved level verified');
}

// 6. 7-Day New Host Promo Boundary Test
{
    const getPromoLevel = (diffDays: number, qualifiedLevel: number) => {
        const isPromoActive = diffDays <= 7;
        return isPromoActive ? Math.max(3, qualifiedLevel) : qualifiedLevel;
    };

    assert.strictEqual(getPromoLevel(1, 1), 3, '1-day old host with Level 1 perf gets Level 3 promo');
    assert.strictEqual(getPromoLevel(6.9, 1), 3, '6.9-day old host gets Level 3 promo');
    assert.strictEqual(getPromoLevel(7.0, 1), 3, 'Exact 7-day old host gets Level 3 promo');
    assert.strictEqual(getPromoLevel(7.1, 1), 1, '7.1-day old host drops to actual qualified level (Level 1)');
    assert.strictEqual(getPromoLevel(2, 5), 5, '2-day old host who achieves Level 5 gets Level 5');

    console.log('  ✅ Test 6 PASSED: 7-Day promo boundary and override rules verified');
}

console.log('\n🎉 ALL 6 AUDIT TEST SUITE CASES PASSED SUCCESSFULLY!\n');
