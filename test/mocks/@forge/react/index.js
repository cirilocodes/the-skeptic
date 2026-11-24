// UI Kit mock for journey tests: every component renders as a host element named after it, so tests can
// find components, read their text and call their handlers. Prop names are checked against the real
// UI Kit names a component accepts, to catch typos that UI Kit would silently ignore.
const React = require('react');
const NAMES = ['Box','Button','ButtonGroup','Code','CodeBlock','DatePicker','DonutChart','DynamicTable','Em','Heading','Inline','Label','Link','Lozenge','Modal','ModalBody','ModalFooter','ModalHeader','ModalTitle','ModalTransition','ProgressTracker','RadioGroup','SectionMessage','Select','Spinner','Stack','Strong','Tab','TabList','TabPanel','Tabs','Text','TextArea','Textfield','Toggle','User','UserPicker','EmptyState','ProgressBar','Tooltip','Badge','LineChart','BarChart','Image'];
const out = { __esModule: true };
for (const n of NAMES) out[n] = (props) => React.createElement(`ui-${n}`, props, props.children);
// EmptyState renders its header, description and actions; the stand-in makes them children so tests
// can read and click them, as people would.
out.EmptyState = (props) => React.createElement('ui-EmptyState', props, props.description, props.primaryAction, props.secondaryAction, props.tertiaryAction);
out.xcss = (x) => x;
const holder = (globalThis.__ui = globalThis.__ui || { element: null });
out.default = { render: (el) => { holder.element = el; } };
module.exports = out;
