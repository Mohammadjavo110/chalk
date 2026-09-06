import {
	stringReplaceAll,
	stringEncaseCRLFWithFirstIndex,
} from './utilities.js';
import ansiStyles from '#ansi-styles';
import supportsColor from '#supports-color';

const {stdout: stdoutColor, stderr: stderrColor} = supportsColor;

const GENERATOR = Symbol('GENERATOR');
const STYLER = Symbol('STYLER');
const IS_EMPTY = Symbol('IS_EMPTY');
const LEVEL = Symbol('LEVEL');

const styles = Object.create(null);

const assertValidLevel = level => {
	if (!Number.isSafeInteger(level) || level < 0 || level > 3) {
		throw new Error('The `level` should be an integer from 0 to 3');
	}
};

// The level is stored under a symbol so the hot path can read it as a plain property, while `level` itself is an accessor that rejects values the rest of the code could not handle.
const levelDescriptor = {
	enumerable: true,
	get() {
		return this[LEVEL];
	},
	set(level) {
		assertValidLevel(level);
		this[LEVEL] = level;
	},
};

const applyOptions = (object, options = {}) => {
	if (options.level !== undefined) {
		assertValidLevel(options.level);
	}

	// Detect level if not set manually. Written under the symbol rather than through `level`, as the prototype carrying that accessor is not installed until after this runs.
	const colorLevel = stdoutColor ? stdoutColor.level : 0;
	object[LEVEL] = options.level === undefined ? colorLevel : options.level;
};

export class Chalk {
	constructor(options) {
		// eslint-disable-next-line no-constructor-return
		return chalkFactory(options);
	}
}

const chalkFactory = (options, chalkProto = createChalk.prototype) => {
	const chalk = (...strings) => strings.join(' ');
	applyOptions(chalk, options);

	Object.setPrototypeOf(chalk, chalkProto);

	return chalk;
};

function createChalk(options) {
	return chalkFactory(options);
}

// eslint-disable-next-line unicorn/no-top-level-side-effects -- The prototype chain must be set up at module load.
Object.setPrototypeOf(createChalk.prototype, Function.prototype);

for (const [styleName, style] of Object.entries(ansiStyles)) {
	styles[styleName] = {
		get() {
			const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
			Object.defineProperty(this, styleName, {value: builder});
			return builder;
		},
	};
}

styles.visible = {
	get() {
		const builder = createBuilder(this, this[STYLER], true);
		Object.defineProperty(this, 'visible', {value: builder});
		return builder;
	},
};

// Resolve a color model to one converter per `level`, so that a call only has to look up the converter for the current level instead of re-deciding the model and level every time.
const createModelConverters = (model, type) => {
	const style = ansiStyles[type];

	if (model === 'rgb') {
		const ansi = (red, green, blue) => style.ansi(ansiStyles.rgbToAnsi(red, green, blue));
		const ansi256 = (red, green, blue) => style.ansi256(ansiStyles.rgbToAnsi256(red, green, blue));
		return [ansi, ansi, ansi256, style.ansi16m];
	}

	if (model === 'hex') {
		const ansi = hex => style.ansi(ansiStyles.hexToAnsi(hex));
		const ansi256 = hex => style.ansi256(ansiStyles.hexToAnsi256(hex));
		return [ansi, ansi, ansi256, hex => style.ansi16m(...ansiStyles.hexToRgb(hex))];
	}

	// `ansi256` is already the native form, so only the 16-color levels need converting.
	const ansi = code => style.ansi(ansiStyles.ansi256ToAnsi(code));
	return [ansi, ansi, style.ansi256, style.ansi256];
};

const usedModels = ['rgb', 'hex', 'ansi256'];

for (const model of usedModels) {
	const capitalizedModel = model[0].toUpperCase() + model.slice(1);

	for (const [styleName, type] of [
		[model, 'color'],
		['bg' + capitalizedModel, 'bgColor'],
		['underline' + capitalizedModel, 'underlineColor'],
	]) {
		const {close} = ansiStyles[type];
		const converters = createModelConverters(model, type);

		styles[styleName] = {
			get() {
				// The level is read on call rather than captured here so the function can be cached on the instance instead of being reallocated on every property access.
				// `rgb` is the widest model, so naming the three parameters avoids a rest array.
				const styleFunction = function (first, second, third) {
					const open = converters[this.level](first, second, third);
					return createBuilder(this, createStyler(open, close, this[STYLER]), this[IS_EMPTY]);
				};

				Object.defineProperty(this, styleName, {value: styleFunction});
				return styleFunction;
			},
		};
	}
}

const proto = Object.defineProperties(
	() => {},
	{
		...styles,
		level: {
			enumerable: true,
			get() {
				return this[GENERATOR].level;
			},
			set(level) {
				this[GENERATOR].level = level;
			},
		},
	},
);

const createStyler = (open, close, parent) => {
	let openAll;
	let closeAll;
	if (parent === undefined) {
		openAll = open;
		closeAll = close;
	} else {
		openAll = parent.openAll + open;
		closeAll = close + parent.closeAll;
	}

	return {
		open,
		close,
		openAll,
		closeAll,
		parent,
	};
};

const createBuilder = (self, _styler, _isEmpty) => {
	// Single argument is hot path, implicit coercion is faster than anything
	const builder = (...arguments_) => {
		if (arguments_.length === 1) {
			// eslint-disable-next-line no-implicit-coercion
			return applyStyle(builder, '' + arguments_[0]);
		}

		if (arguments_.length === 2) {
			return applyStyle(builder, arguments_[0] + ' ' + arguments_[1]);
		}

		return applyStyle(builder, arguments_.join(' '));
	};

	// We alter the prototype because we must return a function, but there is
	// no way to create a function with a different prototype
	Object.setPrototypeOf(builder, proto);

	// Point every builder at the root generator instead of its immediate parent, so reading the level costs one property load rather than walking a `level` getter per link of the chain.
	builder[GENERATOR] = self[GENERATOR] ?? self;
	builder[STYLER] = _styler;
	builder[IS_EMPTY] = _isEmpty;

	return builder;
};

const applyStyle = (self, string) => {
	// Read the level directly off the generator to skip the `level` getter dispatch on this hot path
	if (self[GENERATOR][LEVEL] <= 0 || !string) {
		// eslint-disable-next-line unicorn/no-computed-property-existence-check -- Reads the boolean value, not a property existence check.
		return self[IS_EMPTY] ? '' : string;
	}

	let styler = self[STYLER];

	if (styler === undefined) {
		return string;
	}

	const {openAll, closeAll} = styler;
	if (string.includes('\u{1B}')) {
		while (styler !== undefined) {
			// Replace any instances already present with a re-opening code
			// otherwise only the part of the string until said closing code
			// will be colored, and the rest will simply be 'plain'.
			string = stringReplaceAll(string, styler.close, styler.open);

			styler = styler.parent;
		}
	}

	// We can move both next actions out of loop, because remaining actions in loop won't have
	// any/visible effect on parts we add here. Close the styling before a linebreak and reopen
	// after next line to fix a bleed issue on macOS: https://github.com/chalk/chalk/pull/92
	const lfIndex = string.indexOf('\n');
	if (lfIndex !== -1) {
		string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
	}

	return openAll + string + closeAll;
};

// `level` lives on the prototype rather than on each instance, so it costs nothing to construct an instance and matches how builders already expose it. It is inherited rather than own, so it does not show up in `Object.keys()`, same as for a builder.
// eslint-disable-next-line unicorn/no-top-level-side-effects -- The style getters must be installed at module load.
Object.defineProperties(createChalk.prototype, {...styles, level: levelDescriptor});

// === THEME SYSTEM ===
//
// A theme is a named, reusable style chain that produces a builder rooted at the
// instance that requested it, so `chalk.level = 0` immediately propagates to all
// theme-derived builders. Themes support both registration via `chalk.theme({...})`
// and direct access via `chalk.theme.<name>(...)`. Style names that take arguments
// at call time (e.g. `rgb`, `hex`, `ansi256`) are forbidden inside theme chains
// because their getter returns a function rather than a builder.

const RESERVED_THEME_NAMES = new Set(['level', 'theme']);

const DEFAULT_THEMES = {
	error: 'red.bold',
	warn: 'yellow.bold',
	info: 'blue',
	success: 'green',
};

// Build the set of style names whose getter returns a function taking call-site
// arguments (`rgb`, `bgHex`, `underlineAnsi256`, …). These cannot appear inside a
// theme chain because they don't compose through the normal builder path.
const DYNAMIC_STYLE_NAMES = new Set();
for (const model of usedModels) {
	const capitalizedModel = model[0].toUpperCase() + model.slice(1);
	DYNAMIC_STYLE_NAMES.add(model);
	DYNAMIC_STYLE_NAMES.add('bg' + capitalizedModel);
	DYNAMIC_STYLE_NAMES.add('underline' + capitalizedModel);
}

const isStaticStyle = name =>
	Object.hasOwn(styles, name)
	&& !DYNAMIC_STYLE_NAMES.has(name);

const isThemeDefinition = value =>
	value !== null
	&& typeof value === 'object'
	&& !Array.isArray(value);

const parseThemeChain = definition => {
	if (typeof definition === 'string') {
		return definition.split('.');
	}

	if (Array.isArray(definition)) {
		return [...definition];
	}

	throw new TypeError('Theme style definition must be a string or an array of strings');
};

const validateThemeChain = chain => {
	if (chain.length === 0) {
		throw new Error('Theme style chain cannot be empty');
	}

	for (const part of chain) {
		if (typeof part !== 'string' || part.length === 0) {
			throw new Error('Each style name in a theme chain must be a non-empty string');
		}

		if (!isStaticStyle(part)) {
			throw new Error(`Unknown or non-static style "${part}" in theme definition. Only static styles are allowed.`);
		}
	}

	return chain;
};

const assertValidThemeName = name => {
	if (typeof name !== 'string' || name.length === 0) {
		throw new TypeError('Theme name must be a non-empty string');
	}

	if (RESERVED_THEME_NAMES.has(name)) {
		throw new Error(`Theme name "${name}" is reserved`);
	}
};

const defineThemeGetter = (targetProto, name, chain, chalkRoot) => {
	Object.defineProperty(targetProto, name, {
		enumerable: true,
		configurable: true,
		get() {
			let builder = chalkRoot;
			for (const styleName of chain) {
				builder = builder[styleName];
			}

			Object.defineProperty(this, name, {value: builder, configurable: true, enumerable: true});
			return builder;
		},
	});
};

const THEME_CACHE = Symbol('THEME_CACHE');

const createThemeFor = chalkRoot => {
	const themeProto = Object.create(createChalk.prototype);

	for (const [name, definition] of Object.entries(DEFAULT_THEMES)) {
		assertValidThemeName(name);
		if (Object.hasOwn(themeProto, name)) {
			throw new Error(`Theme "${name}" is already defined`);
		}

		const chain = validateThemeChain(parseThemeChain(definition));
		defineThemeGetter(themeProto, name, chain, chalkRoot);
	}

	const themeInstance = chalkFactory({}, themeProto);

	const themeFunction = function (...args) {
		if (args.length === 1 && isThemeDefinition(args[0])) {
			const definitions = args[0];

			for (const [name, definition] of Object.entries(definitions)) {
				assertValidThemeName(name);
				if (Object.hasOwn(themeProto, name)) {
					throw new Error(`Theme "${name}" is already defined`);
				}

				const chain = validateThemeChain(parseThemeChain(definition));
				defineThemeGetter(themeProto, name, chain, chalkRoot);
			}

			return themeFunction;
		}

		return Reflect.apply(themeInstance, this, args);
	};

	Object.setPrototypeOf(themeFunction, themeInstance);
	return themeFunction;
};

// eslint-disable-next-line unicorn/no-top-level-side-effects -- The legacy `theme` namespace must be installed on the shared prototype at module load.
Object.defineProperty(createChalk.prototype, 'theme', {
	configurable: true,
	enumerable: false,
	get() {
		const cached = this[THEME_CACHE];
		if (cached !== undefined) {
			return cached;
		}

		const theme = createThemeFor(this);
		this[THEME_CACHE] = theme;
		return theme;
	},
});

// === SEMANTIC STYLES ===
//
// Semantic styles (`error`, `warn`, `info`, `success`) and any custom style
// registered through `chalk.defineTheme({...})` are installed as lazy getters
// on the shared `createChalk.prototype`, so they are available on the default
// `chalk` instance, `chalkStderr`, and every `new Chalk()` instance.
//
// A getter walks its style chain through the normal builder system on first
// access and caches the resulting builder on the requesting instance, so no
// ANSI code string is ever cached: setting `chalk.level = 0` in the middle of
// a program makes every semantic style output plain text immediately, just
// like any other chalk style.

const DEFAULT_SEMANTIC_STYLES = {
	error: ['red', 'bold'],
	warn: ['yellow', 'bold'],
	info: ['blue'],
	success: ['green'],
};

// Names that exist on every instance (or the shared prototype) and therefore
// can never be used as a semantic style name.
const SEMANTIC_STYLE_BASE_NAMES = new Set([
	'level',
	'enabled',
	'constructor',
	'theme',
	'defineTheme',
	'__proto__',
]);

// Names already taken by a custom style registered through `defineTheme`.
const REGISTERED_SEMANTIC_STYLES = new Set();

const assertValidSemanticStyleName = name => {
	if (typeof name !== 'string' || name.length === 0) {
		throw new TypeError('Style name must be a non-empty string');
	}

	if (
		SEMANTIC_STYLE_BASE_NAMES.has(name)
		|| Object.hasOwn(styles, name)
		|| Object.hasOwn(DEFAULT_SEMANTIC_STYLES, name)
	) {
		throw new Error(`Theme style name "${name}" collides with a built-in property`);
	}

	if (REGISTERED_SEMANTIC_STYLES.has(name)) {
		throw new Error(`Theme style name "${name}" is already defined`);
	}
};

const defineSemanticStyleGetter = (name, chain) => {
	Object.defineProperty(createChalk.prototype, name, {
		configurable: true,
		enumerable: false,
		get() {
			const [firstStyle, ...restStyles] = chain;
			let builder = this[firstStyle];
			for (const styleName of restStyles) {
				builder = builder[styleName];
			}

			// Cache the resolved builder on the requesting instance. The builder is
			// rooted at that instance, so the level is still read live at call time
			// and `chalk.level = 0` keeps working after the first access.
			Object.defineProperty(this, name, {value: builder, configurable: true});
			return builder;
		},
	});

	REGISTERED_SEMANTIC_STYLES.add(name);
};

for (const [name, definition] of Object.entries(DEFAULT_SEMANTIC_STYLES)) {
	defineSemanticStyleGetter(name, validateThemeChain(parseThemeChain(definition)));
}

// eslint-disable-next-line unicorn/no-top-level-side-effects -- The `defineTheme` method must be installed on the shared prototype at module load.
Object.defineProperty(createChalk.prototype, 'defineTheme', {
	configurable: true,
	enumerable: false,
	value(definitions) {
		if (!isThemeDefinition(definitions)) {
			throw new TypeError('Theme definitions must be an object of style names to style chains');
		}

		// Validate every entry first, so a bad definition cannot partially register the good ones.
		const registrations = Object.entries(definitions).map(([name, definition]) => {
			assertValidSemanticStyleName(name);
			return [name, validateThemeChain(parseThemeChain(definition))];
		});

		for (const [name, chain] of registrations) {
			defineSemanticStyleGetter(name, chain);
		}

		return this;
	},
});

const chalk = createChalk();
export const chalkStderr = createChalk({level: stderrColor ? stderrColor.level : 0});

export {
	modifierNames,
	foregroundColorNames,
	backgroundColorNames,
	underlineColorNames,
	colorNames,

	// TODO: Remove these aliases in the next major version
	modifierNames as modifiers,
	foregroundColorNames as foregroundColors,
	backgroundColorNames as backgroundColors,
	colorNames as colors,
} from './vendor/ansi-styles/index.js';

export {
	stdoutColor as supportsColor,
	stderrColor as supportsColorStderr,
};

export default chalk;
