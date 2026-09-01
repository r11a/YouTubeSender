import test from "node:test";
import assert from "node:assert/strict";
import { contactInSmartGroup, dailyWorkspace, pipelineStage } from "../server/workflow.js";
import { generateContentKit } from "../server/ai.js";

test("pipeline prioritizes completed delivery over campaign state", () => {
  const video={id:"v1",distributionStatus:"new"};
  assert.equal(pipelineStage(video,[{videoIds:["v1"],status:"scheduled"}],[]),"scheduled");
  assert.equal(pipelineStage(video,[],[{videoId:"v1",status:"sent"}]),"sent");
});

test("smart groups filter by language and country", () => {
  const group={type:"smart",rules:{language:"he",country:"ישראל"}};
  assert.equal(contactInSmartGroup({id:"1",language:"he",country:"ישראל",active:true},group,[]),true);
  assert.equal(contactInSmartGroup({id:"2",language:"en",country:"ישראל",active:true},group,[]),false);
});

test("daily workspace groups videos and open tasks", () => {
  const result=dailyWorkspace({videos:[{id:"v",distributionStatus:"new"}],campaigns:[],deliveries:[],notifications:[],tasks:[{id:"t",status:"open"}]});
  assert.equal(result.stages.new.length,1);assert.equal(result.tasks.length,1);
});

test("local AI content kit includes message, hashtags and readiness score", async () => {
  const kit=await generateContentKit({provider:"local",video:{title:"Albania Drone Journey",description:"A detailed flight above Berat",url:"https://youtu.be/x",folder:"אלבניה",thumbnail:"x"}});
  assert.match(kit.hashtags,/אלבניה/);assert.ok(kit.message.length>40);assert.ok(kit.quality.score>=80);
});
