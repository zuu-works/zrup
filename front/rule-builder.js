/**
 * @callback RuleBuilder~definerAcceptor
 * @param {RuleBuilder~definer} definer
 */

/**
 * @callback RuleBuilder~definer
 * @param {RuleBuilder~DefinerParams} params
 * @return {Recipe}
 */

/**
 * @typedef {Object.<string,*>} RuleBuilder~DefinerParams
 * @property {Rule} rule
 * @property {RuleBuilder~artifactNominator} depends
 * @property {RuleBuilder~artifactNominator} produces
 * @property {RuleBuilder~ruleNominator} after
 */

/**
 * @callback RuleBuilder~artifactNominator
 * @param {...Artifact~Reference} artifactRefs
 */

import {Rule} from "../graph/rule";
import {Module} from "../module";
import {AID} from "../graph/artifact";
import {Dependency} from "../graph/dependency";

/**
 * @callback RuleBuilder~ruleNominator
 * @param {...string} ruleRefs
 */

/**
 * @callback RuleBuilder~boundDefiner
 * @return {Recipe}
 */

/**
 * @typedef {Object} RuleBuilder~Declaration
 * @property {Module} module
 * @property {Rule} rule
 * @property {RuleBuilder~boundDefiner} boundDefiner
 */

export class RuleBuilder
{
    /** @type {Project} */
    #project;

    /** @type {ArtifactManager} */
    #artifactManager;

    /** @type {RuleBuilder~Declaration[]} */
    #declarations = [];

    /** @type {{ [string]: string[]}} */
    #afterEdges = {};

    /**
     * @param {Project} project
     * @param {ArtifactManager} artifactManager
     */
    constructor(project, artifactManager)
    {
        this.#project = project;
        this.#artifactManager = artifactManager;
    }

    get project()
    {
        return this.#project;
    }

    /**
     * @param {Module} module
     * @return {RuleBuilder~definerAcceptor}
     */
    bindDefinerAcceptor(module)
    {
        return this.acceptDefiner.bind(this, module);
    }

    /**
     * @param {Module} module
     * @param {RuleBuilder~definer|string} nameOrDefiner
     * @param {RuleBuilder~definer|undefined} [definerWhenNameGiven]
     */
    acceptDefiner(module, nameOrDefiner, definerWhenNameGiven)
    {
        const name = "string" === typeof nameOrDefiner ? nameOrDefiner: nameOrDefiner.name;
        const definer = "string" === typeof nameOrDefiner ? definerWhenNameGiven : nameOrDefiner;
        const rule = new Rule(module, name);
        this.project.graph.addRule(rule);
        this.#declarations.push(this.#createDeclaration(module, rule, definer));
    }

    /**
     * @param {Module} module
     * @param {Rule} rule
     * @param {RuleBuilder~definer} definer
     * @return {RuleBuilder~Declaration}
     */
    #createDeclaration(module, rule, definer)
    {
        return {
            module,
            rule,
            boundDefiner: this.#bindDefiner(module, rule, definer)
        };
    }

    /**
     * @param {Module} module
     * @param {Rule} rule
     * @param {RuleBuilder~definer} definer
     * @return {RuleBuilder~boundDefiner}
     */
    #bindDefiner(module, rule, definer)
    {
        return definer.bind(null, this.#bindDefinerArgs(module, rule));
    }

    /**
     * @param {Module} module
     * @param {Rule} rule
     * @return {RuleBuilder~DefinerParams}
     */
    #bindDefinerArgs(module, rule)
    {
        return {
            rule,
            depends: this.depends.bind(this, module, rule),
            produces: this.produces.bind(this, module, rule),
            after: this.after.bind(this, module, rule)
        }
    }

    /**
     * @param {Module} module
     * @param {Rule} rule
     * @param {...Artifact~Reference} artifactRefs
     * @return {Dependency[]}
     */
    depends(module, rule, ...artifactRefs)
    {
        const result = [];
        for (let ref of artifactRefs) {
            const artifact = this.#artifactManager.get(new AID(ref+'').withDefaults({ module: module.name }));
            const whenAbsent = Dependency.ABSENT_VIOLATION;
            result.push(rule.addDependency(artifact, whenAbsent));
        }
        return result;
    }

    /**
     * @param {Module} module
     * @param {Rule} rule
     * @param {...Artifact~Reference} artifactRefs
     * @return {Artifact[]}
     */
    produces(module, rule, ...artifactRefs)
    {
        const result = [];
        for(let ref of artifactRefs) {
            const artifact = this.#artifactManager.get(new AID(ref+'').withDefaults({ module: module.name }))
            rule.addOutput(artifact);
            result.push(artifact);
        }
        return result;
    }

    /**
     * @param {Module} module
     * @param {Rule} dependentRule
     * @param {...string} prerequisiteRuleRefs
     * @return {RuleBuilder~artifactNominator}
     */
    after(module, dependentRule, ...prerequisiteRuleRefs)
    {
        this.#afterEdges[dependentRule.key] = (this.#afterEdges[dependentRule.key] || []).concat(prerequisiteRuleRefs);
    }

    finalize()
    {
        for(let {rule, boundDefiner} of this.#declarations) {
            rule.recipe = boundDefiner();
        }
        for(let {rule} of this.#declarations) {
            this.project.graph.indexRule(rule);
        }
        for(let ruleKey in this.#afterEdges) {
            const dependentRule = this.project.graph.index.rule.key.get(ruleKey);
            if (!dependentRule) {
                //TODO: throw something meaningful instead of ignoring silently, this shouldn't happen!
                continue;
            }
            for(let prerequisiteRuleRef of this.#afterEdges[ruleKey]) {
                this.addPrerequisiteRule(dependentRule, prerequisiteRuleRef)
            }
        }
    }

    /**
     *
     * @param {Rule} dependentRule
     * @param {string} prerequisiteRuleRef
     */
    addPrerequisiteRule(dependentRule, prerequisiteRuleRef)
    {
        const parsedResolvedRef = Object.assign(
            {
                module: dependentRule.module.name,
                ref: (u=>u)()
            },
            AID.parse(prerequisiteRuleRef),
            {
                type: "rule"
            }
        );
        const resolvedRefString = AID.descriptorToString(parsedResolvedRef);
        const prerequisiteRuleKey = Rule.computeKey(resolvedRefString);
        const prerequisiteRule = this.project.graph.index.rule.key.get(prerequisiteRuleKey);
        if (!prerequisiteRule) {
            throw new Error(
                `${resolvedRefString} required as prerequisite for ${dependentRule.identity} was not found in the graph`
            );
        }
        dependentRule.after[prerequisiteRuleKey]=prerequisiteRule;
    }

}