import {ProjectTesting} from "../../../../util/testing.js";
import path from "path";
import {RuleBuilder} from "../../../../front/rule-builder.js";
import copy from "recursive-copy";

import {fileURLToPath} from 'url';
import {dirname} from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import chai from "chai";
const expect = chai.expect;
import {ModuleBuilder} from "../../../../front/module-builder.js";
import {Build} from "../../../../build.js";
import {Db} from "../../../../db.js";

const d = new ProjectTesting(path.join(__dirname,"tmp"), {createRootModule: false});

/** @type {RuleBuilder|null} */
let ruleBuilder = null;

function setup()
{
    d.setup();
    beforeEach(async () => {
        await copy(path.join(__dirname, "files"), d.project.path, {dot: true});
        ruleBuilder = new RuleBuilder(d.project, d.artifactManager);
    });
    afterEach(() => {
        ruleBuilder = null;
    })
}

describe("DelayedRecipe", async() => {

    setup();

    it("executes a wrapped recipe after delay", async() => {

        const db = new Db(path.join(d.tmpDir.toString(),".data/states.sqlite"));

        await new ModuleBuilder(d.project, ruleBuilder).loadRootModule();
        ruleBuilder.finalize();

        const actual = d.artifactManager.get('actual.txt');
        const expected = d.artifactManager.get('expected.txt');

        /** @type {(Job|null)} */
        let job = null;
        async function runNewJob() {
            await (job = await new Build(d.project.graph, db, d.artifactManager).getJobForArtifact(actual)).run();
            return job;
        }

        let t = process.hrtime.bigint();
        await runNewJob();
        expect(Number(process.hrtime.bigint()-t)/1000000).to.not.be.lessThan(300);
        expect(job.recipeInvoked).to.be.true;
        expect(await actual.exists).to.be.true;
        expect(await actual.version).to.equal(await expected.version);
    });
})