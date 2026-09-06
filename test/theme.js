import test from 'ava';
import chalk, {Chalk, chalkStderr} from '../source/index.js';

// Force a deterministic level so ANSI codes are predictable.
chalk.level = 3;
chalkStderr.level = 3;

// === Default semantic styles ===

test('expose default semantic styles: error, warn, info, success', t => {
	t.is(typeof chalk.error, 'function');
	t.is(typeof chalk.warn, 'function');
	t.is(typeof chalk.info, 'function');
	t.is(typeof chalk.success, 'function');
});

test('chalk.error wraps text in red + bold', t => {
	t.is(chalk.error('boom'), '\u{1B}[31m\u{1B}[1mboom\u{1B}[22m\u{1B}[39m');
});

test('chalk.warn wraps text in yellow + bold', t => {
	t.is(chalk.warn('careful'), '\u{1B}[33m\u{1B}[1mcareful\u{1B}[22m\u{1B}[39m');
});

test('chalk.info wraps text in blue', t => {
	t.is(chalk.info('fyi'), '\u{1B}[34mfyi\u{1B}[39m');
});

test('chalk.success wraps text in green', t => {
	t.is(chalk.success('done'), '\u{1B}[32mdone\u{1B}[39m');
});

test('semantic styles support multiple arguments', t => {
	t.is(chalk.error('foo', 'bar'), '\u{1B}[31m\u{1B}[1mfoo bar\u{1B}[22m\u{1B}[39m');
});

test('semantic styles support falsy values', t => {
	t.is(chalk.error(0), '\u{1B}[31m\u{1B}[1m0\u{1B}[22m\u{1B}[39m');
});

test('semantic styles are chainable with builtin styles: chalk.error.underline', t => {
	t.is(chalk.error.underline('zap'), '\u{1B}[31m\u{1B}[1m\u{1B}[4mzap\u{1B}[24m\u{1B}[22m\u{1B}[39m');
});

test('semantic styles are chainable with builtin styles: chalk.success.bgBlack', t => {
	t.is(chalk.success.bgBlack('ok'), '\u{1B}[32m\u{1B}[40mok\u{1B}[49m\u{1B}[39m');
});

test('semantic styles are chainable with multiple builtin styles', t => {
	t.is(chalk.warn.italic.underline('careful'), '\u{1B}[33m\u{1B}[1m\u{1B}[3m\u{1B}[4mcareful\u{1B}[24m\u{1B}[23m\u{1B}[22m\u{1B}[39m');
});

// === Custom semantic styles via chalk.defineTheme ===

test('register custom semantic styles with chalk.defineTheme({...})', t => {
	chalk.defineTheme({myCustomStyle: 'bgCyan.black.underline', highlight: 'magenta.bold'});
	t.is(typeof chalk.myCustomStyle, 'function');
	t.is(typeof chalk.highlight, 'function');
	t.is(chalk.myCustomStyle('hi'), '\u{1B}[46m\u{1B}[30m\u{1B}[4mhi\u{1B}[24m\u{1B}[39m\u{1B}[49m');
	t.is(chalk.highlight('stand out'), '\u{1B}[35m\u{1B}[1mstand out\u{1B}[22m\u{1B}[39m');
});

test('register custom semantic style with array of style names', t => {
	chalk.defineTheme({arrayTheme: ['green', 'bold']});
	t.is(chalk.arrayTheme('yay'), '\u{1B}[32m\u{1B}[1myay\u{1B}[22m\u{1B}[39m');
});

test('register custom semantic style with single-element chain', t => {
	chalk.defineTheme({onlyRed: 'red'});
	t.is(chalk.onlyRed('x'), '\u{1B}[31mx\u{1B}[39m');
});

test('chalk.defineTheme({...}) returns chalk for chaining', t => {
	t.is(chalk.defineTheme({}), chalk);
	t.is(chalk.defineTheme({chainable: 'magenta'}), chalk);
	t.is(chalk.chainable('x'), '\u{1B}[35mx\u{1B}[39m');
});

test('custom semantic styles are chainable with builtin styles', t => {
	chalk.defineTheme({alert: 'yellow.bold'});
	t.is(chalk.alert.underline('text'), '\u{1B}[33m\u{1B}[1m\u{1B}[4mtext\u{1B}[24m\u{1B}[22m\u{1B}[39m');
});

// === Level reactivity ===

test('chalk.level = 0 disables colors for default semantic styles', t => {
	const old = chalk.level;
	chalk.level = 0;
	t.is(chalk.error('boom'), 'boom');
	t.is(chalk.warn('careful'), 'careful');
	t.is(chalk.info('fyi'), 'fyi');
	t.is(chalk.success('done'), 'done');
	chalk.level = old;
});

test('chalk.level = 0 disables colors for custom semantic styles', t => {
	chalk.defineTheme({reactTest: 'red.bold'});
	const old = chalk.level;
	chalk.level = 0;
	t.is(chalk.reactTest('text'), 'text');
	chalk.level = old;
});

test('level changes propagate even after the semantic style builder is cached', t => {
	chalk.level = 3;
	const {error} = chalk;
	chalk.level = 0;
	t.is(error('text'), 'text');
	chalk.level = 3;
	t.is(error('text'), '\u{1B}[31m\u{1B}[1mtext\u{1B}[22m\u{1B}[39m');
});

test('level changes propagate to chained semantic styles', t => {
	chalk.level = 3;
	const errorUnderline = chalk.error.underline;
	chalk.level = 0;
	t.is(errorUnderline('text'), 'text');
	chalk.level = 3;
	t.is(errorUnderline('text'), '\u{1B}[31m\u{1B}[1m\u{1B}[4mtext\u{1B}[24m\u{1B}[22m\u{1B}[39m');
});

// === Validation ===

test('throw on unknown style in chain', t => {
	t.throws(() => chalk.defineTheme({invalid: 'notarealstyle'}), {message: /Unknown or non-static style "notarealstyle"/v});
});

test('throw on dynamic (argument-taking) style rgb in chain', t => {
	t.throws(() => chalk.defineTheme({dynamicRgb: 'rgb.bold'}), {message: /Unknown or non-static style "rgb"/v});
});

test('throw on dynamic style hex in chain', t => {
	t.throws(() => chalk.defineTheme({dynamicHex: 'hex'}), {message: /Unknown or non-static style "hex"/v});
});

test('throw on dynamic style underlineAnsi256 in chain', t => {
	t.throws(() => chalk.defineTheme({dynamicU256: 'underlineAnsi256'}), {message: /Unknown or non-static style "underlineAnsi256"/v});
});

test('throw when one link of the chain is invalid', t => {
	t.throws(() => chalk.defineTheme({partiallyInvalid: 'red.notreal.bold'}), {message: /Unknown or non-static style "notreal"/v});
});

test('throw when the style name collides with a built-in style', t => {
	t.throws(() => chalk.defineTheme({red: 'blue'}), {message: /Theme style name "red" collides with a built-in property/v});
});

test('throw when the style name collides with a base property', t => {
	t.throws(() => chalk.defineTheme({level: 'red'}), {message: /Theme style name "level" collides with a built-in property/v});
	t.throws(() => chalk.defineTheme({enabled: 'red'}), {message: /Theme style name "enabled" collides with a built-in property/v});
	t.throws(() => chalk.defineTheme({constructor: 'red'}), {message: /Theme style name "constructor" collides with a built-in property/v});
});

test('throw when the style name collides with a default semantic style', t => {
	t.throws(() => chalk.defineTheme({error: 'blue'}), {message: /Theme style name "error" collides with a built-in property/v});
});

test('throw when the style name collides with a chalk method', t => {
	t.throws(() => chalk.defineTheme({theme: 'red'}), {message: /Theme style name "theme" collides with a built-in property/v});
	t.throws(() => chalk.defineTheme({defineTheme: 'red'}), {message: /Theme style name "defineTheme" collides with a built-in property/v});
});

test('throw when registering a duplicate custom semantic style', t => {
	chalk.defineTheme({myUnique: 'red'});
	t.throws(() => chalk.defineTheme({myUnique: 'blue'}), {message: /Theme style name "myUnique" is already defined/v});
});

test('throw on empty array chain', t => {
	t.throws(() => chalk.defineTheme({emptyArr: []}), {message: /Theme style chain cannot be empty/v});
});

test('throw on non-string/non-array chain definition', t => {
	t.throws(() => chalk.defineTheme({numberDef: 42}), {message: /Theme style definition must be a string or an array of strings/v});
});

test('throw when the definitions argument is not an object', t => {
	t.throws(() => chalk.defineTheme('nope'), {message: /Theme definitions must be an object of style names to style chains/v});
});

// === Instances ===

test('default semantic styles are available on a new Chalk instance', t => {
	const instance = new Chalk({level: 3});
	t.is(instance.error('boom'), '\u{1B}[31m\u{1B}[1mboom\u{1B}[22m\u{1B}[39m');
	t.is(instance.info('fyi'), '\u{1B}[34mfyi\u{1B}[39m');
});

test('semantic styles respect the instance level', t => {
	const instance = new Chalk({level: 0});
	t.is(instance.error('boom'), 'boom');
	t.is(instance.success('done'), 'done');
});

test('default semantic styles are available on chalkStderr and respect chalkStderr.level', t => {
	const old = chalkStderr.level;
	chalkStderr.level = 3;
	t.is(chalkStderr.error('boom'), '\u{1B}[31m\u{1B}[1mboom\u{1B}[22m\u{1B}[39m');
	chalkStderr.level = 0;
	t.is(chalkStderr.error('boom'), 'boom');
	chalkStderr.level = old;
});

test('custom semantic styles are available on every instance', t => {
	chalk.defineTheme({globalStyle: 'cyan.underline'});
	t.is(typeof chalkStderr.globalStyle, 'function');
	t.is(typeof new Chalk().globalStyle, 'function');
	t.is(new Chalk({level: 3}).globalStyle('x'), '\u{1B}[36m\u{1B}[4mx\u{1B}[24m\u{1B}[39m');
});

// === Unicode ===

test('Persian text passes through unchanged when wrapped in a semantic style', t => {
	t.is(chalk.success('عملیات انجام شد'), '\u{1B}[32mعملیات انجام شد\u{1B}[39m');
	t.is(chalk.error('متن دلخواه شما'), '\u{1B}[31m\u{1B}[1mمتن دلخواه شما\u{1B}[22m\u{1B}[39m');
});

// === Legacy `chalk.theme` API ===

test('legacy: expose default themes: error, warn, info, success', t => {
	t.is(typeof chalk.theme.error, 'function');
	t.is(typeof chalk.theme.warn, 'function');
	t.is(typeof chalk.theme.info, 'function');
	t.is(typeof chalk.theme.success, 'function');
});

test('legacy: chalk.theme.error wraps text in red + bold', t => {
	t.is(chalk.theme.error('boom'), '\u{1B}[31m\u{1B}[1mboom\u{1B}[22m\u{1B}[39m');
});

test('legacy: chalk.theme.warn wraps text in yellow + bold', t => {
	t.is(chalk.theme.warn('careful'), '\u{1B}[33m\u{1B}[1mcareful\u{1B}[22m\u{1B}[39m');
});

test('legacy: chalk.theme.info wraps text in blue', t => {
	t.is(chalk.theme.info('fyi'), '\u{1B}[34mfyi\u{1B}[39m');
});

test('legacy: chalk.theme.success wraps text in green', t => {
	t.is(chalk.theme.success('done'), '\u{1B}[32mdone\u{1B}[39m');
});

test('legacy: chain theme with builtin style: theme.error.underline', t => {
	t.is(chalk.theme.error.underline('zap'), '\u{1B}[31m\u{1B}[1m\u{1B}[4mzap\u{1B}[24m\u{1B}[22m\u{1B}[39m');
});

test('legacy: chain theme with builtin style: theme.success.bgBlack', t => {
	t.is(chalk.theme.success.bgBlack('ok'), '\u{1B}[32m\u{1B}[40mok\u{1B}[49m\u{1B}[39m');
});

test('legacy: chain theme with multiple builtin styles', t => {
	t.is(chalk.theme.warn.italic.underline('careful'), '\u{1B}[33m\u{1B}[1m\u{1B}[3m\u{1B}[4mcareful\u{1B}[24m\u{1B}[23m\u{1B}[22m\u{1B}[39m');
});

test('legacy: register custom theme with chalk.theme({...})', t => {
	chalk.theme({legacyCool: 'bgCyan.black.underline', legacyAlert: 'red.bold'});
	t.is(typeof chalk.theme.legacyCool, 'function');
	t.is(typeof chalk.theme.legacyAlert, 'function');
	t.is(chalk.theme.legacyCool('hi'), '\u{1B}[46m\u{1B}[30m\u{1B}[4mhi\u{1B}[24m\u{1B}[39m\u{1B}[49m');
	t.is(chalk.theme.legacyAlert('be careful'), '\u{1B}[31m\u{1B}[1mbe careful\u{1B}[22m\u{1B}[39m');
});

test('legacy: register custom theme with array of style names', t => {
	chalk.theme({legacyArray: ['green', 'bold']});
	t.is(chalk.theme.legacyArray('yay'), '\u{1B}[32m\u{1B}[1myay\u{1B}[22m\u{1B}[39m');
});

test('legacy: register custom theme with single-element chain', t => {
	chalk.theme({legacyOnlyRed: 'red'});
	t.is(chalk.theme.legacyOnlyRed('x'), '\u{1B}[31mx\u{1B}[39m');
});

test('legacy: chalk.theme({...}) returns chalk.theme for chaining', t => {
	const result = chalk.theme({legacyChainable: 'magenta'});
	t.is(result, chalk.theme);
	t.is(chalk.theme.legacyChainable('x'), '\u{1B}[35mx\u{1B}[39m');
});

test('legacy: chalk.level = 0 disables colors for default themes', t => {
	const old = chalk.level;
	chalk.level = 0;
	t.is(chalk.theme.error('boom'), 'boom');
	t.is(chalk.theme.warn('careful'), 'careful');
	t.is(chalk.theme.info('fyi'), 'fyi');
	t.is(chalk.theme.success('done'), 'done');
	chalk.level = old;
});

test('legacy: chalk.level = 0 disables colors for custom themes', t => {
	chalk.theme({legacyReact: 'red.bold'});
	const old = chalk.level;
	chalk.level = 0;
	t.is(chalk.theme.legacyReact('text'), 'text');
	chalk.level = old;
});

test('legacy: level changes propagate even after the theme builder is cached', t => {
	chalk.level = 3;
	const {warn} = chalk.theme;
	chalk.level = 0;
	t.is(warn('text'), 'text');
	chalk.level = 3;
	t.is(warn('text'), '\u{1B}[33m\u{1B}[1mtext\u{1B}[22m\u{1B}[39m');
});

test('legacy: level changes propagate to chained theme styles', t => {
	const old = chalk.level;
	chalk.level = 3;
	const errorUnderline = chalk.theme.error.underline;
	chalk.level = 0;
	t.is(errorUnderline('text'), 'text');
	chalk.level = old;
});

test('legacy: throw on unknown style in chain', t => {
	t.throws(() => chalk.theme({legacyInvalid: 'notarealstyle'}), {message: /Unknown or non-static style "notarealstyle"/v});
});

test('legacy: throw on reserved theme name "level"', t => {
	t.throws(() => chalk.theme({level: 'red'}), {message: /Theme name "level" is reserved/v});
});

test('legacy: throw on reserved theme name "theme"', t => {
	t.throws(() => chalk.theme({theme: 'red'}), {message: /Theme name "theme" is reserved/v});
});

test('legacy: throw when registering a duplicate default theme', t => {
	t.throws(() => chalk.theme({error: 'blue'}), {message: /Theme "error" is already defined/v});
});

test('legacy: throw when registering a duplicate custom theme', t => {
	chalk.theme({legacyUnique: 'red'});
	t.throws(() => chalk.theme({legacyUnique: 'blue'}), {message: /Theme "legacyUnique" is already defined/v});
});

test('legacy: throw on empty array chain', t => {
	t.throws(() => chalk.theme({emptyArr: []}), {message: /Theme style chain cannot be empty/v});
});

test('legacy: throw on non-string/non-array chain definition', t => {
	t.throws(() => chalk.theme({numberDef: 42}), {message: /Theme style definition must be a string or an array of strings/v});
});

test('legacy: chalk.theme called without arguments returns empty string', t => {
	t.is(chalk.theme(), '');
});

test('legacy: chalk.theme called with a string returns plain text', t => {
	t.is(chalk.theme('hello'), 'hello');
	t.is(chalk.theme('hello', 'world'), 'hello world');
});

test('legacy: chalk.theme is callable as a function without registering', t => {
	t.notThrows(() => chalk.theme('arbitrary text'));
});

test('legacy: custom themes registered on chalk do not leak to chalkStderr', t => {
	chalk.level = 3;
	chalkStderr.level = 3;
	chalk.theme({legacyOnlyMain: 'magenta'});
	t.is(typeof chalk.theme.legacyOnlyMain, 'function');
	t.is(typeof chalkStderr.theme.legacyOnlyMain, 'undefined');
});

test('legacy: chalkStderr.theme.error is independent and respects chalkStderr.level', t => {
	const old = chalkStderr.level;
	chalkStderr.level = 3;
	t.is(chalkStderr.theme.error('boom'), '\u{1B}[31m\u{1B}[1mboom\u{1B}[22m\u{1B}[39m');
	chalkStderr.level = 0;
	t.is(chalkStderr.theme.error('boom'), 'boom');
	chalkStderr.level = old;
});

test('legacy: a new Chalk instance has its own theme', t => {
	const instance = new Chalk({level: 3});
	t.is(typeof instance.theme.error, 'function');
	t.is(instance.theme.error('x'), '\u{1B}[31m\u{1B}[1mx\u{1B}[22m\u{1B}[39m');
	instance.theme({legacyOnInstance: 'yellow'});
	t.is(typeof instance.theme.legacyOnInstance, 'function');
	t.is(typeof chalk.theme.legacyOnInstance, 'undefined');
});

test('legacy: Persian text passes through unchanged when wrapped in a theme', t => {
	t.is(chalk.theme.success('عملیات انجام شد'), '\u{1B}[32mعملیات انجام شد\u{1B}[39m');
	t.is(chalk.theme.error('متن دلخواه شما'), '\u{1B}[31m\u{1B}[1mمتن دلخواه شما\u{1B}[22m\u{1B}[39m');
});
