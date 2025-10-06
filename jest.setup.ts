import { TextEncoder, TextDecoder } from 'util';

// Mock TextEncoder and TextDecoder for Jest
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
// Using type casting to avoid 'any'

global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
