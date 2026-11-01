import { useTestEnv } from './test-env';

// Runs in every test file before its imports execute: the app must connect to the test database.
useTestEnv();
