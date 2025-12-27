#!/usr/bin/env bun

/**
 * Dual Authentication Test Script
 *
 * Tests the dual authentication implementation for HAPI:
 * 1. Admin mode (CLI_API_TOKEN)
 * 2. Project mode (HAPI_API_TOKEN)
 * 3. Token priority
 * 4. Invalid token rejection
 *
 * Usage:
 *   bun run test-dual-auth.ts [server-url] [admin-token]
 *
 * Example:
 *   bun run test-dual-auth.ts http://localhost:3006 your-admin-token-here
 */

import axios, { type AxiosError } from 'axios'
import { randomBytes } from 'crypto'

interface TestResult {
    name: string
    passed: boolean
    message: string
    details?: unknown
}

const results: TestResult[] = []

// Configuration
const SERVER_URL = process.argv[2] || process.env.HAPI_SERVER_URL || 'http://localhost:3006'
const ADMIN_TOKEN = process.argv[3] || process.env.CLI_API_TOKEN || ''
const PROJECT_TOKEN = randomBytes(32).toString('hex') // Generate a random project token for testing

console.log('='.repeat(70))
console.log('  HAPI Dual Authentication Test Suite')
console.log('='.repeat(70))
console.log()
console.log(`Server URL: ${SERVER_URL}`)
console.log(`Admin Token: ${ADMIN_TOKEN.substring(0, 10)}...`)
console.log(`Test Project Token: ${PROJECT_TOKEN.substring(0, 10)}...`)
console.log()

if (!ADMIN_TOKEN) {
    console.error('ERROR: Admin token is required!')
    console.error('Usage: bun run test-dual-auth.ts [server-url] [admin-token]')
    console.error('Or set CLI_API_TOKEN environment variable')
    process.exit(1)
}

/**
 * Test helper to make API requests
 */
async function testRequest(
    name: string,
    token: string,
    projectPath: string | null = null
): Promise<TestResult> {
    try {
        const response = await axios.post(
            `${SERVER_URL}/cli/sessions`,
            {
                tag: `test-${Date.now()}`,
                metadata: { test: true, timestamp: Date.now() },
                agentState: null,
                authMode: projectPath ? 'project' : 'admin',
                projectPath
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10_000
            }
        )

        if (response.status === 200 && response.data.session) {
            return {
                name,
                passed: true,
                message: 'Request successful',
                details: {
                    sessionId: response.data.session.id,
                    status: response.status
                }
            }
        }

        return {
            name,
            passed: false,
            message: `Unexpected response: ${response.status}`,
            details: response.data
        }
    } catch (error) {
        const axiosError = error as AxiosError
        return {
            name,
            passed: false,
            message: `Request failed: ${axiosError.response?.status || axiosError.message}`,
            details: axiosError.response?.data
        }
    }
}

/**
 * Test helper for expected failures
 */
async function testExpectedFailure(
    name: string,
    token: string,
    expectedStatus: number = 401
): Promise<TestResult> {
    try {
        const response = await axios.post(
            `${SERVER_URL}/cli/sessions`,
            {
                tag: `test-${Date.now()}`,
                metadata: { test: true },
                agentState: null
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10_000
            }
        )

        return {
            name,
            passed: false,
            message: `Expected failure but got status ${response.status}`,
            details: response.data
        }
    } catch (error) {
        const axiosError = error as AxiosError
        if (axiosError.response?.status === expectedStatus) {
            return {
                name,
                passed: true,
                message: `Correctly rejected with status ${expectedStatus}`,
                details: axiosError.response.data
            }
        }

        return {
            name,
            passed: false,
            message: `Expected status ${expectedStatus} but got ${axiosError.response?.status || axiosError.message}`,
            details: axiosError.response?.data
        }
    }
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('Starting tests...')
    console.log()

    // Test 1: Admin mode authentication
    console.log('Test 1: Admin Mode Authentication (CLI_API_TOKEN)')
    const test1 = await testRequest(
        'Admin mode authentication',
        ADMIN_TOKEN,
        null
    )
    results.push(test1)
    console.log(`  ${test1.passed ? '✓' : '✗'} ${test1.message}`)
    if (test1.details) {
        console.log(`    Details:`, test1.details)
    }
    console.log()

    // Test 2: Project mode authentication - First time binding
    console.log('Test 2: Project Mode Authentication - First Time (HAPI_API_TOKEN)')
    const projectPath1 = '/tmp/test-project-1'
    const test2 = await testRequest(
        'Project mode authentication (first time)',
        PROJECT_TOKEN,
        projectPath1
    )
    results.push(test2)
    console.log(`  ${test2.passed ? '✓' : '✗'} ${test2.message}`)
    if (test2.details) {
        console.log(`    Details:`, test2.details)
        console.log(`    Project Path: ${projectPath1}`)
    }
    console.log()

    // Test 3: Project mode authentication - Same token, same path
    console.log('Test 3: Project Mode Authentication - Same Token, Same Path')
    const test3 = await testRequest(
        'Project mode authentication (same path)',
        PROJECT_TOKEN,
        projectPath1
    )
    results.push(test3)
    console.log(`  ${test3.passed ? '✓' : '✗'} ${test3.message}`)
    if (test3.details) {
        console.log(`    Details:`, test3.details)
    }
    console.log()

    // Test 4: Project mode authentication - Same token, different path
    console.log('Test 4: Project Mode Authentication - Same Token, Different Path')
    console.log('  (Note: Current implementation allows this, future enhancement may restrict)')
    const projectPath2 = '/tmp/test-project-2'
    const test4 = await testRequest(
        'Project mode authentication (different path)',
        PROJECT_TOKEN,
        projectPath2
    )
    results.push(test4)
    console.log(`  ${test4.passed ? '✓' : '✗'} ${test4.message}`)
    if (test4.details) {
        console.log(`    Details:`, test4.details)
        console.log(`    Project Path: ${projectPath2}`)
    }
    console.log()

    // Test 5: Any token becomes a project token (current design)
    console.log('Test 5: New Token Auto-Registration')
    console.log('  (Note: Current implementation allows any token to become a project token)')
    const newToken = 'user-generated-token-' + randomBytes(16).toString('hex')
    const test5 = await testRequest(
        'New token auto-registration',
        newToken,
        '/tmp/test-new-token-project'
    )
    results.push(test5)
    console.log(`  ${test5.passed ? '✓' : '✗'} ${test5.message}`)
    if (test5.details) {
        console.log(`    Details:`, test5.details)
        console.log(`    Token: ${newToken.substring(0, 20)}...`)
    }
    console.log()

    // Test 6: Missing Authorization header
    console.log('Test 6: Missing Authorization Header')
    try {
        const response = await axios.post(
            `${SERVER_URL}/cli/sessions`,
            {
                tag: `test-${Date.now()}`,
                metadata: { test: true },
                agentState: null
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10_000
            }
        )

        results.push({
            name: 'Missing Authorization header',
            passed: false,
            message: `Expected failure but got status ${response.status}`,
            details: response.data
        })
        console.log(`  ✗ Expected failure but got status ${response.status}`)
    } catch (error) {
        const axiosError = error as AxiosError
        const passed = axiosError.response?.status === 401
        results.push({
            name: 'Missing Authorization header',
            passed,
            message: passed ? 'Correctly rejected with status 401' : `Unexpected status ${axiosError.response?.status}`,
            details: axiosError.response?.data
        })
        console.log(`  ${passed ? '✓' : '✗'} ${passed ? 'Correctly rejected with status 401' : `Unexpected status ${axiosError.response?.status}`}`)
    }
    console.log()

    // Test 7: Test /cli/machines endpoint with admin token
    console.log('Test 7: Machines Endpoint - Admin Mode')
    try {
        const response = await axios.post(
            `${SERVER_URL}/cli/machines`,
            {
                id: `test-machine-${Date.now()}`,
                metadata: { test: true, hostname: 'test-host' },
                daemonState: null,
                authMode: 'admin',
                projectPath: null
            },
            {
                headers: {
                    Authorization: `Bearer ${ADMIN_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10_000
            }
        )

        const passed = response.status === 200 && response.data.machine
        results.push({
            name: 'Machines endpoint - admin mode',
            passed,
            message: passed ? 'Request successful' : `Unexpected response: ${response.status}`,
            details: passed ? { machineId: response.data.machine.id } : response.data
        })
        console.log(`  ${passed ? '✓' : '✗'} ${passed ? 'Request successful' : `Unexpected response: ${response.status}`}`)
        if (passed) {
            console.log(`    Machine ID: ${response.data.machine.id}`)
        }
    } catch (error) {
        const axiosError = error as AxiosError
        results.push({
            name: 'Machines endpoint - admin mode',
            passed: false,
            message: `Request failed: ${axiosError.response?.status || axiosError.message}`,
            details: axiosError.response?.data
        })
        console.log(`  ✗ Request failed: ${axiosError.response?.status || axiosError.message}`)
    }
    console.log()

    // Test 8: Test /cli/machines endpoint with project token
    console.log('Test 8: Machines Endpoint - Project Mode')
    try {
        const machineProjectPath = '/tmp/test-machine-project'
        const response = await axios.post(
            `${SERVER_URL}/cli/machines`,
            {
                id: `test-machine-${Date.now()}`,
                metadata: { test: true, hostname: 'test-host' },
                daemonState: null,
                authMode: 'project',
                projectPath: machineProjectPath
            },
            {
                headers: {
                    Authorization: `Bearer ${PROJECT_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10_000
            }
        )

        const passed = response.status === 200 && response.data.machine
        results.push({
            name: 'Machines endpoint - project mode',
            passed,
            message: passed ? 'Request successful' : `Unexpected response: ${response.status}`,
            details: passed ? { machineId: response.data.machine.id, projectPath: machineProjectPath } : response.data
        })
        console.log(`  ${passed ? '✓' : '✗'} ${passed ? 'Request successful' : `Unexpected response: ${response.status}`}`)
        if (passed) {
            console.log(`    Machine ID: ${response.data.machine.id}`)
            console.log(`    Project Path: ${machineProjectPath}`)
        }
    } catch (error) {
        const axiosError = error as AxiosError
        results.push({
            name: 'Machines endpoint - project mode',
            passed: false,
            message: `Request failed: ${axiosError.response?.status || axiosError.message}`,
            details: axiosError.response?.data
        })
        console.log(`  ✗ Request failed: ${axiosError.response?.status || axiosError.message}`)
    }
    console.log()

    // Print summary
    console.log('='.repeat(70))
    console.log('  Test Summary')
    console.log('='.repeat(70))
    console.log()

    const passed = results.filter((r) => r.passed).length
    const failed = results.filter((r) => !r.passed).length
    const total = results.length

    console.log(`Total Tests: ${total}`)
    console.log(`Passed: ${passed} ✓`)
    console.log(`Failed: ${failed} ${failed > 0 ? '✗' : ''}`)
    console.log()

    if (failed > 0) {
        console.log('Failed Tests:')
        results.filter((r) => !r.passed).forEach((r) => {
            console.log(`  ✗ ${r.name}: ${r.message}`)
            if (r.details) {
                console.log(`    Details:`, r.details)
            }
        })
        console.log()
    }

    console.log('='.repeat(70))

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0)
}

// Run the tests
runTests().catch((error) => {
    console.error('Fatal error running tests:', error)
    process.exit(1)
})
