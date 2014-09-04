package main

import (
	"encoding/json"
	"log"
    "strings"
	"github.com/couchbaselabs/go-couchbase"
	"github.com/hoisie/web"
)

var ddocs = map[string]string{
	"jenkins": `{
		"views": {
			"data_by_build": {
				"map": "function (doc, meta) {emit([doc.build, doc.os, doc.component], [doc.failCount, doc.totalCount, doc.priority, doc.name, doc.result, doc.url, doc.build_id]);}",
                "reduce" : "function (key, values, rereduce) {var fAbs = 0;var pAbs = 0;for(i=0;i < values.length; i++) {fAbs = fAbs + values[i][0];pAbs = pAbs + values[i][1];} var total = fAbs + pAbs; var pRel = 100.0*pAbs/total; var fRel = 100.0*fAbs/total; return([pAbs, -fAbs, pRel, fRel]);}"
            }
		}
	}`,
}

type DataSource struct {
	CouchbaseAddress string
	Release          string
}

func (ds *DataSource) GetBucket(bucket string) *couchbase.Bucket {
	client, _ := couchbase.Connect(ds.CouchbaseAddress)
	pool, _ := client.GetPool("default")

	b, err := pool.GetBucket(bucket)
	if err != nil {
		log.Fatalf("Error reading bucket:  %v", err)
	}
	return b
}

func (ds *DataSource) QueryView(b *couchbase.Bucket, ddoc, view string,
	params map[string]interface{}) []couchbase.ViewRow {
	params["stale"] = "false"
	vr, err := b.View(ddoc, view, params)
	if err != nil {
       log.Println(err);
	   ds.installDDoc(ddoc)
	}
    return vr.Rows
}

func (ds *DataSource) installDDoc(ddoc string) {
	b := ds.GetBucket(ddoc) // bucket name == ddoc name
	err := b.PutDDoc(ddoc, ddocs[ddoc])
	if err != nil {
		log.Fatalf("%v", err)
	}
}

var TIMELINE_SIZE = 40

var VIEW = map[string]int{
	"failCount":  0,
	"totalCount": 1,
	"priority":   2,
	"name":       3,
	"result":     4,
	"url":        5,
	"bid":        6,
}

var REDUCE = map[string]int{
    "absPassed": 0,
    "absFailed": 1,
    "relPassed": 2,
    "relFailed": 3,
}

type MapBuild struct {
	Version string
	Passed   float64
	Failed   float64
	Category string
	Platform string
	Priority string
}

type Breakdown struct {
	Passed float64
	Failed float64
}

type Job struct {
	Passed   float64
	Total float64
	Priority string
    Name string
    Result string
    Url string
    Bid float64
}

type ReduceBuild struct {
	Version string
	AbsPassed  float64
	AbsFailed  float64
	RelPassed  float64
	RelFailed  float64
}

type FullSet struct {
	ByPlatform map[string]Breakdown
	ByPriority map[string]Breakdown
}

func appendIfUnique(slice []string, s string) []string {
	for i := range slice {
		if slice[i] == s {
			return slice
		}
	}
	return append(slice, s)
}

func posInSlice(slice []string, s string) int {
	for i := range slice {
		if slice[i] == s {
			return i
		}
	}
	return -1
}


func (ds *DataSource) GetJobs(ctx *web.Context) []byte {
	b := ds.GetBucket("jenkins")
    var platforms string
    var categories string
    var version string
    for k,v := range ctx.Params {
        if k == "categories" {
            categories = v;
        }
        if k == "platforms" {
            platforms = v;
        }
        if k == "build" {
            version = v;
        }
    }


    jobs := []Job{}
    platformArray := strings.Split(platforms, ",")
    categoryArray := strings.Split(categories, ",")
    for _, platform := range platformArray{
        for _, category := range categoryArray{
            params := map[string]interface{}{
            "key":  []interface{}{version,platform,category},
            "inclusive_end": true,
            "reduce": false,
            "stale": false,
            }
            rows := ds.QueryView(b, "jenkins", "data_by_build", params)
            for _, row := range rows {

                value := row.Value.([]interface{})
                failed := value[VIEW["failed"]].(float64)
                total  := value[VIEW["totalCount"]].(float64)
                priority := value[VIEW["priority"]].(string)
                name := value[VIEW["name"]].(string)
                result := value[VIEW["result"]].(string)
                url := value[VIEW["url"]].(string)
                bid := value[VIEW["bid"]].(float64)
                passed := total - failed

                jobs = append(jobs, Job{
                   passed,
                   total,
                   priority,
                   name,
                   result,
                   url,
                   bid,
                })
            }
        }
    }

	j, _ := json.Marshal(jobs)
	return j
}

func (ds *DataSource) GetBreakdown(ctx *web.Context) []byte {
	b := ds.GetBucket("jenkins")
    version := ds.Release;
    for k,v := range ctx.Params {
        if k == "build" {
            version = v;
        }
    }
    params := map[string]interface{}{
    "start_key":  []interface{}{version},
    "end_key":  []interface{}{version+"_"},
    "group_level" : 3,
    }
	rows := ds.QueryView(b, "jenkins", "data_by_build", params)

	/***************** MAP *****************/
	mapBuilds := []MapBuild{}
	for _, row := range rows {
		meta := row.Key.([]interface{})

		value := row.Value.([]interface{})
		failed, ok := value[REDUCE["absFailed"]].(float64)
		if !ok {
			continue
		}
        if failed < 0 {
            failed = failed * -1
        }
		passed , ok := value[REDUCE["absPassed"]].(float64)
		if !ok {
			continue
		}
		version  := meta[0].(string)
		platform := meta[1].(string)
		category := meta[2].(string)

		mapBuilds = append(mapBuilds, MapBuild{
            version,
			passed,
			failed,
			category,
			platform,
			"na",
		})
	}


	j, _ := json.Marshal(mapBuilds)
	return j
}

func (ds *DataSource) GetTimeline() []byte {
	b := ds.GetBucket("jenkins")
    log.Println(ds.Release)
    params := map[string]interface{}{
        "start_key":  []interface{}{ds.Release},
        "group_level" : 1,
    }
	rows := ds.QueryView(b, "jenkins", "data_by_build", params)

	/***************** Query Reduce Views*****************/
	reduceBuild := []ReduceBuild{}
	for _, row := range rows {
		rowKey := row.Key.([]interface{})
        version := rowKey[0].(string)
        if version == "0.0.0-xxxx" {
            continue
        }
		value := row.Value.([]interface{})
		reduceBuild = append(reduceBuild,
            ReduceBuild{
                version,
                value[REDUCE["absPassed"]].(float64),
                value[REDUCE["absFailed"]].(float64),
                value[REDUCE["relPassed"]].(float64),
                value[REDUCE["relFailed"]].(float64),
            })
	}

	j, _ := json.Marshal(reduceBuild)
	return j
}