// The module path must match where the code actually lives. It declared
// github.com/daon-network/daon-go-sdk, a repository that does not exist, so
// `go get` could never resolve it and the publish workflow could never tag it.
module github.com/daon-network/daon/sdks/go

go 1.21
