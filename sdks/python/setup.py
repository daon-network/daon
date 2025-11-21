from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="daon-sdk",
    version="1.0.0",
    author="DAON Network",
    author_email="dev@daon.network",
    description="DAON Creator Protection SDK for Python applications",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/daon-network/python-sdk",
    license="Liberation License v1.0",
    project_urls={
        "Bug Tracker": "https://github.com/daon-network/python-sdk/issues",
        "Documentation": "https://docs.daon.network/python",
        "Homepage": "https://daon.network",
        "License": "https://github.com/liberationlicense/license",
    },
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "License :: Other/Proprietary License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Internet :: WWW/HTTP",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Security :: Cryptography",
        "Topic :: Multimedia :: Graphics",
        "Topic :: Text Processing",
    ],
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.25.0",
        "typing-extensions>=4.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-cov>=4.0.0",
            "requests-mock>=1.9.0",
            "black>=22.0.0",
            "flake8>=5.0.0",
            "mypy>=1.0.0",
        ],
        "async": [
            "aiohttp>=3.8.0",
            "asyncio>=3.4.3",
        ],
        "django": [
            "Django>=3.2.0",
        ],
        "flask": [
            "Flask>=2.0.0",
        ],
    },
    keywords=[
        "creator-protection",
        "blockchain",
        "copyright", 
        "content",
        "fanfiction",
        "ai-protection",
        "daon",
    ],
)