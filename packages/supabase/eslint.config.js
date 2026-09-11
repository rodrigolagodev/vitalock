import base from '@vitalock/config-eslint/base';
import { boundaries } from '@vitalock/config-eslint/boundaries';

export default [...base, boundaries('package')];
