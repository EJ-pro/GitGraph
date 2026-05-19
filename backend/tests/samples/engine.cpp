#include <iostream>
#include <vector>
#include <string>
#include "my_header.h"

#define MAX_SIZE 100
#define PI 3.14159265358979

// Base class for all entities in the simulation
class Animal {
public:
    std::string name;

    Animal(const std::string& n) : name(n) {}

    virtual void speak() {
        std::cout << name << " makes a sound." << std::endl;
    }

    void eat() {
        std::cout << name << " is eating." << std::endl;
    }

    virtual ~Animal() {}
};

class Dog : public Animal {
public:
    Dog(const std::string& n) : Animal(n) {}

    void speak() override {
        std::cout << name << " barks!" << std::endl;
    }
};

struct Point {
    int x;
    int y;
};

struct Rect {
    Point topLeft;
    Point bottomRight;
};

int add(int a, int b) {
    return a + b;
}

double area(const Rect& r) {
    int w = r.bottomRight.x - r.topLeft.x;
    int h = r.bottomRight.y - r.topLeft.y;
    return static_cast<double>(w * h);
}

int main() {
    Animal* dog = new Dog("Rex");
    dog->speak();
    delete dog;
    return 0;
}
