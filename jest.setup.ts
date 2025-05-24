import { TextEncoder, TextDecoder } from 'util';

// Mock TextEncoder and TextDecoder for Jest
global.TextEncoder = TextEncoder;
// Using type casting to avoid 'any'

global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
