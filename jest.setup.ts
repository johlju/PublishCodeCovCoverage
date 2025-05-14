import { TextEncoder, TextDecoder } from 'util';

// Mock TextEncoder and TextDecoder for Jest
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;
