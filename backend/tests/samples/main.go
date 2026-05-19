package main

import (
	"fmt"
	"net/http"
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
)

// Server holds the HTTP server configuration.
type Server struct {
	port    int
	router  *gin.Engine
}

// Handler defines a generic request handler interface.
type Handler interface {
	Handle(ctx *gin.Context)
	Validate(ctx *gin.Context) bool
}

// Start begins listening on the configured port.
func (s *Server) Start() {
	addr := fmt.Sprintf(":%d", s.port)
	http.ListenAndServe(addr, s.router)
}

func (s *Server) RegisterRoutes() {
	s.router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
}

func NewServer(port int) *Server {
	return &Server{
		port:   port,
		router: gin.Default(),
	}
}

func main() {
	srv := NewServer(8080)
	srv.RegisterRoutes()
	go srv.Start()

	select {}
}
